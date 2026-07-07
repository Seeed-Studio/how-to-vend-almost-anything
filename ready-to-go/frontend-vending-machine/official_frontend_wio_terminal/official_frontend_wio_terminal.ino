#include <Wire.h>
#include <TFT_eSPI.h>
#include "Emakefun_RFID.h"
#include "SCServo.h"
#include <rpcWiFi.h>
#include <HTTPClient.h>

// =====================================================
// OFFICIAL FRONTEND VENDING MACHINE (Wio Terminal)
// =====================================================
// One of the two Wio Terminals in the system. This is the customer-facing
// reader that dispenses products. The other Wio (backend-full/wio-rfid-writer)
// writes the cards.
//
// Flow for every card:
//   1. Read the card and its selling type (written by the backend writer):
//        {"type":"direct",   "user_name":"..","order_number":"..","v":1}
//        {"type":"selecting","user_name":"..","v":1}
//   2. Ask backend-full for permission (no permission -> no dispense):
//        POST /api/frontend/verify-card
//   3. Dispense:
//        direct    -> dispense the reserved product (servo_id x quantity)
//        selecting -> customer picks products on screen within their balance;
//                     POST /api/frontend/selecting/checkout to spend + get plan
//   4. Report so the backend deducts / finalizes:
//        POST /api/frontend/dispense-complete
//
// The backend deducts stock at step 2/3 and refuses when a column needs a
// refill, so a valid card still will not dispense from an empty column.
//
// RFID: Emakefun MFRC522 over I2C 0x28 on Wire1 (Grove I2C), key FF*6,
//       payload across MIFARE blocks 4,5,6,8,9,10.
// Servos: Feetech SMS/STS bus servos ids 1..4 on Serial1 @ 1,000,000 baud.
//         Positions use the ZERO/MAX values calibrated with the testing_phase
//         1-a / 1-b sketches. One dispense = ZERO -> MAX -> ZERO.
// =====================================================

// ---------------- WIFI / BACKEND ----------------
const char* WIFI_SSID = "SEEED-MKT";
const char* WIFI_PASSWORD = "edgemaker2023";

// Same-WiFi backend example: "http://192.168.1.20:3000"
// Public deployment example:  "https://your-app.onrender.com"
const char* BACKEND_BASE_URL = "http://192.168.7.164:3000";

const char* DEVICE_ID = "frontend-1";
const char* API_KEY = "FRONTEND_1_SECRET";

bool wifiReady = false;

// ---------------- LCD ----------------
TFT_eSPI tft;

// ---------------- RFID ----------------
#define RFID_ADDR 0x28
MFRC522 mfrc522(RFID_ADDR);
MFRC522::MIFARE_Key rfidKey;
bool rfidReady = false;

// Must match the backend writer. Do not use sector trailer blocks 7 or 11.
const byte DATA_BLOCKS[] = {4, 5, 6, 8, 9, 10};
const int DATA_BLOCK_COUNT = sizeof(DATA_BLOCKS) / sizeof(DATA_BLOCKS[0]);
const int MAX_PAYLOAD_LEN = DATA_BLOCK_COUNT * 16;

// ---------------- SERVO ----------------
#define SERVO_NUM 4
SMS_STS st;
byte ID[SERVO_NUM] = {1, 2, 3, 4};

// ZERO (home) + MAX per servo id 1..4, captured with testing_phase 1-a and
// verified with 1-b. Re-run those sketches to recalibrate if the mechanism
// changes. MAX < ZERO here: the servos travel in the decreasing direction.
const s16 ZERO_POS[SERVO_NUM] = {2490, 2598, 2897, 3651};
const s16 MAX_POS[SERVO_NUM]  = {250, 262, 905, 1552};

const u16 MOVE_SPEED     = 2000;
const u8  MOVE_ACC       = 50;
const int SETTLE_TIMEOUT = 3000;   // ms max wait for one leg
const int ARRIVE_TOL     = 20;     // units; how close counts as arrived

bool present[SERVO_NUM] = {false, false, false, false};

// ---------------- STATE ----------------
enum State { WAIT_RFID, AUTH };
State state = WAIT_RFID;

// ---------------- SESSION ----------------
String currentCardUID = "";
String currentUserName = "";
String currentOrderNumber = "";

// selecting session (per-servo, index 0..3 == servo id 1..4)
float selBalance = 0;
long  selStock[SERVO_NUM]  = {0, 0, 0, 0};
float selPrice[SERVO_NUM]  = {0, 0, 0, 0};
long  selNeeds[SERVO_NUM]  = {0, 0, 0, 0};
long  selActive[SERVO_NUM] = {1, 1, 1, 1};
String selNames[SERVO_NUM];

// ---------------- DISPLAY ----------------
void displayScreen(const char* title, const char* l1, const char* l2, const char* l3, uint16_t color) {
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(color, TFT_BLACK);
  tft.setTextSize(2);
  tft.setCursor(20, 30);
  tft.println(title);
  tft.drawFastHLine(0, 70, 320, TFT_DARKGREY);
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.setTextSize(2);
  tft.setCursor(20, 100); tft.println(l1);
  tft.setCursor(20, 140); tft.println(l2);
  tft.setCursor(20, 180); tft.println(l3);
}

void showWelcome() {
  if (!rfidReady) {
    displayScreen("XIAO Vending", "Press A to start", "the RFID reader", "", TFT_YELLOW);
  } else {
    displayScreen("XIAO Vending", "Scan your card", "to collect / shop", "", TFT_CYAN);
  }
}

void showDispenseProgress(const char* who, byte id, int t, int times) {
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_GREEN, TFT_BLACK);
  tft.setTextSize(3);
  tft.setCursor(20, 25); tft.println("DISPENSING");
  tft.drawFastHLine(0, 70, 320, TFT_DARKGREY);
  tft.setTextSize(2);
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.setCursor(20, 100); tft.print("Card: "); tft.println(who);
  tft.setTextColor(TFT_CYAN, TFT_BLACK);
  tft.setCursor(20, 140); tft.print("Servo "); tft.print(id);
  tft.setCursor(20, 175); tft.print("Move "); tft.print(t); tft.print("/"); tft.print(times);
}

// ---------------- SERVO HELPERS ----------------
void moveTo(byte id, s16 target) {
  st.WritePosEx(id, target, MOVE_SPEED, MOVE_ACC);
  unsigned long start = millis();
  int startPos = st.ReadPos(id);
  int last = startPos;
  bool started = false;
  while (millis() - start < (unsigned long)SETTLE_TIMEOUT) {
    delay(50);
    int now = st.ReadPos(id);
    if (now < 0) continue;
    if (abs(now - (int)target) <= ARRIVE_TOL) return;
    if (!started && startPos >= 0 && abs(now - startPos) > 40) started = true;
    if (started && abs(now - last) < 4) return;
    last = now;
  }
}

// One actuation of servo index i: ZERO -> MAX -> ZERO (full mechanism cycle).
void dispenseOnce(int i) {
  if (!present[i]) return;
  moveTo(ID[i], MAX_POS[i]);
  moveTo(ID[i], ZERO_POS[i]);
}

void dispenseServo(int idx, int times, const char* who) {
  for (int t = 1; t <= times; t++) {
    Serial.print("[DISPENSE] "); Serial.print(who);
    Serial.print(" servo "); Serial.print(ID[idx]);
    Serial.print(" move "); Serial.print(t); Serial.print("/"); Serial.println(times);
    showDispenseProgress(who, ID[idx], t, times);
    dispenseOnce(idx);
    delay(300);
  }
}

void homeAllToZero() {
  for (int i = 0; i < SERVO_NUM; i++) {
    if (present[i]) st.WritePosEx(ID[i], ZERO_POS[i], MOVE_SPEED, MOVE_ACC);
  }
  unsigned long start = millis();
  while (millis() - start < (unsigned long)SETTLE_TIMEOUT) {
    bool allThere = true;
    for (int i = 0; i < SERVO_NUM; i++) {
      if (!present[i]) continue;
      int now = st.ReadPos(ID[i]);
      if (now < 0 || abs(now - (int)ZERO_POS[i]) > ARRIVE_TOL) { allThere = false; break; }
    }
    if (allThere) break;
    delay(40);
  }
}

// ---------------- JSON ----------------
String jsonValue(const String& json, const String& key) {
  String needle = "\"" + key + "\":";
  int p = json.indexOf(needle);
  if (p < 0) return "";
  p += needle.length();
  while (p < json.length() && (json[p] == ' ' || json[p] == '\t')) p++;
  if (p >= json.length()) return "";
  if (json[p] == '"') {
    int start = p + 1;
    int end = json.indexOf('"', start);
    if (end < 0) return "";
    return json.substring(start, end);
  }
  int end = json.indexOf(',', p);
  if (end < 0) end = json.indexOf('}', p);
  if (end < 0) end = json.length();
  String value = json.substring(p, end);
  value.trim();
  return value;
}

String jsonEscape(String value) {
  value.replace("\\", "\\\\");
  value.replace("\"", "\\\"");
  return value;
}

// Parse a fixed-length numeric JSON array: "key":[a,b,c,d]
void jsonNumberArray(const String& json, const String& key, float* out, int count) {
  for (int i = 0; i < count; i++) out[i] = 0;
  String needle = "\"" + key + "\":[";
  int p = json.indexOf(needle);
  if (p < 0) return;
  p += needle.length();
  int idx = 0;
  while (idx < count && p < json.length()) {
    while (p < json.length() && (json[p] == ' ' || json[p] == '\t')) p++;
    int end = p;
    while (end < json.length() && json[end] != ',' && json[end] != ']') end++;
    String num = json.substring(p, end);
    num.trim();
    out[idx++] = num.toFloat();
    if (end >= json.length() || json[end] == ']') break;
    p = end + 1;
  }
}

// Split "a|b|c|d" into up to count Strings.
void splitPipe(const String& value, String* out, int count) {
  for (int i = 0; i < count; i++) out[i] = "";
  int idx = 0, start = 0;
  while (idx < count) {
    int bar = value.indexOf('|', start);
    if (bar < 0) { out[idx++] = value.substring(start); break; }
    out[idx++] = value.substring(start, bar);
    start = bar + 1;
  }
}

// ---------------- RFID ----------------
void stopRFID() {
  mfrc522.PICC_HaltA();
  mfrc522.PCD_StopCrypto1();
}

String getScannedUIDString() {
  String uidText = "";
  for (byte i = 0; i < mfrc522.uid.size; i++) {
    if (mfrc522.uid.uidByte[i] < 0x10) uidText += "0";
    uidText += String(mfrc522.uid.uidByte[i], HEX);
    if (i < mfrc522.uid.size - 1) uidText += " ";
  }
  uidText.toUpperCase();
  return uidText;
}

bool authenticateBlock(byte blockAddr) {
  MFRC522::StatusCode status = (MFRC522::StatusCode)mfrc522.PCD_Authenticate(
    MFRC522::PICC_CMD_MF_AUTH_KEY_A, blockAddr, &rfidKey, &(mfrc522.uid));
  if (status != MFRC522::STATUS_OK) {
    Serial.print("[RFID] Auth failed block "); Serial.print(blockAddr);
    Serial.print(": "); Serial.println(mfrc522.GetStatusCodeName(status));
    return false;
  }
  return true;
}

bool readPayloadFromCard(String &payload) {
  payload = "";
  for (int b = 0; b < DATA_BLOCK_COUNT; b++) {
    byte blockAddr = DATA_BLOCKS[b];
    if (!authenticateBlock(blockAddr)) return false;
    byte buffer[18];
    byte size = sizeof(buffer);
    MFRC522::StatusCode status = (MFRC522::StatusCode)mfrc522.MIFARE_Read(blockAddr, buffer, &size);
    if (status != MFRC522::STATUS_OK) {
      Serial.print("[RFID] Read failed block "); Serial.print(blockAddr);
      Serial.print(": "); Serial.println(mfrc522.GetStatusCodeName(status));
      return false;
    }
    for (int i = 0; i < 16; i++) {
      if (buffer[i] == 0) continue;
      payload += (char)buffer[i];
    }
  }
  payload.trim();
  Serial.print("[RFID] Payload: "); Serial.println(payload);
  return payload.length() > 0;
}

void initRFID() {
  // Visible feedback so pressing A always does something on screen.
  displayScreen("RFID", "Checking reader...", "", "", TFT_CYAN);
  delay(150);
  Wire1.begin();
  // PCD_Reset() is now bounded (see Emakefun_RFID.cpp), so PCD_Init can no longer
  // hang when the reader is missing - the version register tells us if it is there.
  mfrc522.PCD_Init();
  byte v = mfrc522.PCD_ReadRegister(mfrc522.VersionReg);
  Serial.print("[RFID] Version register: 0x");
  if (v < 0x10) Serial.print("0");
  Serial.println(v, HEX);
  if (v == 0x00 || v == 0xFF) {
    Serial.println("[RFID] Reader not responding (check Grove I2C port / 0x28)");
    rfidReady = false;
    displayScreen("RFID NOT FOUND", "Use the Grove I2C port", "(same as testing), 0x28", "then press A to retry", TFT_RED);
  } else {
    Serial.println("[RFID] Reader ready");
    mfrc522.PCD_AntennaOn();
    rfidReady = true;
    state = AUTH;
    showWelcome();
  }
}

// ---------------- WIFI / HTTP ----------------
const char* wifiStatusText(int s) {
  switch (s) {
    case WL_CONNECTED:       return "connected";
    case WL_NO_SSID_AVAIL:   return "SSID not found (2.4/5G?)";
    case WL_CONNECT_FAILED:  return "auth failed (password?)";
    case WL_CONNECTION_LOST: return "connection lost";
    case WL_DISCONNECTED:    return "disconnected";
    case WL_IDLE_STATUS:     return "idle";
    case WL_NO_SHIELD:       return "no wifi core!";
    default:                 return "working...";
  }
}

// Connect with visible per-attempt status so a stall is never a blank
// "please wait". Bounded so boot always continues; the reader reconnects on
// demand (ensureWiFi) later. If the attempt counter below never advances, the
// call is hanging inside WiFi.begin() itself -> update the Wio wireless-core
// (RTL8720) firmware, which is the usual first-time cause.
bool connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) { wifiReady = true; return true; }

  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_CYAN, TFT_BLACK);
  tft.setTextSize(2);
  tft.setCursor(20, 22); tft.println("Connecting WiFi");
  tft.drawFastHLine(0, 56, 320, TFT_DARKGREY);
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.setCursor(20, 72); tft.print("SSID: "); tft.println(WIFI_SSID);

  Serial.print("[WIFI] Connecting to: "); Serial.println(WIFI_SSID);
  WiFi.disconnect(true);          // clear any half-open state from a prior try
  delay(200);
  WiFi.mode(WIFI_STA);            // rpcWiFi is unreliable without an explicit mode
  delay(200);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  const int MAX_ATTEMPTS = 30;    // ~15s, then boot continues
  int attempts = 0;
  int s = WiFi.status();
  while (s != WL_CONNECTED && attempts < MAX_ATTEMPTS) {
    delay(500);
    attempts++;
    s = WiFi.status();
    Serial.print("[WIFI] attempt "); Serial.print(attempts); Serial.print("/");
    Serial.print(MAX_ATTEMPTS); Serial.print(" status="); Serial.println(s);

    tft.fillRect(0, 104, 320, 110, TFT_BLACK);
    tft.setTextSize(2);
    tft.setTextColor(TFT_YELLOW, TFT_BLACK);
    tft.setCursor(20, 110); tft.print("Attempt "); tft.print(attempts); tft.print("/"); tft.print(MAX_ATTEMPTS);
    tft.setCursor(20, 144); tft.print("Status: "); tft.print(s);
    tft.setTextSize(1);
    tft.setTextColor(TFT_DARKGREY, TFT_BLACK);
    tft.setCursor(20, 178); tft.print(wifiStatusText(s));

    if (attempts == 12 && WiFi.status() != WL_CONNECTED) {   // nudge the radio once
      Serial.println("[WIFI] re-begin");
      WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    }
  }

  if (WiFi.status() == WL_CONNECTED) {
    wifiReady = true;
    Serial.print("[WIFI] Connected, IP "); Serial.println(WiFi.localIP());
    return true;
  }
  wifiReady = false;
  Serial.println("[WIFI] Failed to connect");
  displayScreen("WIFI ERROR", WIFI_SSID, wifiStatusText(WiFi.status()), "Will retry on card scan", TFT_RED);
  delay(1800);
  return false;
}

bool ensureWiFi() {
  if (WiFi.status() == WL_CONNECTED) { wifiReady = true; return true; }
  connectWiFi();
  return WiFi.status() == WL_CONNECTED;
}

String postJsonToBackend(const char* path, String body, int &httpCode) {
  httpCode = -999;
  if (!ensureWiFi()) return "";
  HTTPClient http;
  String url = String(BACKEND_BASE_URL) + String(path);
  Serial.print("[HTTP] POST "); Serial.println(url);
  Serial.print("[HTTP] Body: "); Serial.println(body);
  http.begin(url);
  http.setTimeout(8000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-id", DEVICE_ID);
  http.addHeader("x-api-key", API_KEY);
  httpCode = http.POST(body);
  String response = "";
  if (httpCode > 0) response = http.getString();
  http.end();
  response.trim();
  Serial.print("[HTTP] Code: "); Serial.println(httpCode);
  Serial.print("[HTTP] Resp: "); Serial.println(response);
  return response;
}

bool reportDispenseComplete(const String& orderNumber, bool success, const char* notes) {
  int code = 0;
  String body = "{";
  body += "\"order_number\":\"" + jsonEscape(orderNumber) + "\",";
  body += "\"success\":" + String(success ? "true" : "false") + ",";
  body += "\"notes\":\"" + jsonEscape(String(notes)) + "\"";
  body += "}";
  String response = postJsonToBackend("/api/frontend/dispense-complete", body, code);
  return code >= 200 && code < 300 && response.indexOf("\"ok\":true") >= 0;
}

// ---------------- SELECTION PAGE (selecting cards) ----------------
#define SEL_OK    SERVO_NUM
#define SEL_CLEAR (SERVO_NUM + 1)
#define SEL_ITEMS (SERVO_NUM + 2)

int maxQtyFor(int i) {
  int m = (int)selStock[i];
  if (m > 9) m = 9;              // one digit on screen, plenty for a booth
  if (selActive[i] == 0) m = 0;
  return m;
}

float cartTotal(const int* times) {
  float t = 0;
  for (int i = 0; i < SERVO_NUM; i++) t += times[i] * selPrice[i];
  return t;
}

void drawSelectButton(int x, int y, int w, int h, const char* label, bool hl, uint16_t accent) {
  uint16_t fill = hl ? accent : TFT_BLACK;
  uint16_t txt  = hl ? TFT_BLACK : accent;
  tft.fillRect(x, y, w, h, fill);
  tft.drawRect(x, y, w, h, accent);
  tft.setTextSize(2);
  tft.setTextColor(txt, fill);
  tft.setCursor(x + 14, y + 8);
  tft.print(label);
}

void drawSelectDashboard(int cursor, const int* times) {
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_GREEN, TFT_BLACK);
  tft.setTextSize(2);
  tft.setCursor(8, 4); tft.println("SELECT PRODUCTS");

  float total = cartTotal(times);
  float left = selBalance - total;
  tft.setTextSize(1);
  tft.setTextColor(left < 0 ? TFT_RED : TFT_CYAN, TFT_BLACK);
  tft.setCursor(8, 26);
  tft.print("Bal $"); tft.print(selBalance, 2);
  tft.print("  Cost $"); tft.print(total, 2);
  tft.print("  Left $"); tft.print(left, 2);
  tft.drawFastHLine(0, 38, 320, TFT_DARKGREY);

  int y = 44;
  for (int i = 0; i < SERVO_NUM; i++) {
    bool hl = (cursor == i);
    if (hl) tft.fillRect(4, y - 2, 312, 30, TFT_BLUE);
    uint16_t bg = hl ? TFT_BLUE : TFT_BLACK;
    bool sellable = (selStock[i] > 0 && selActive[i] == 1);
    uint16_t fg = !sellable ? TFT_DARKGREY : (times[i] > 0 ? TFT_GREEN : TFT_WHITE);
    tft.setTextColor(fg, bg);
    tft.setTextSize(2);
    tft.setCursor(10, y);
    tft.print("ID"); tft.print(ID[i]);
    tft.setCursor(70, y);
    tft.print("$"); tft.print(selPrice[i], 2);
    tft.setCursor(200, y);
    tft.print("x"); tft.print(times[i]); tft.print("/"); tft.print((int)selStock[i]);
    // short name / refill flag
    tft.setTextSize(1);
    tft.setTextColor(selNeeds[i] ? TFT_YELLOW : TFT_DARKGREY, bg);
    tft.setCursor(70, y + 16);
    if (selStock[i] <= 0) tft.print("empty");
    else if (selNeeds[i]) tft.print("low");
    else { String nm = selNames[i]; if (nm.length() > 20) nm = nm.substring(0, 20); tft.print(nm); }
    y += 32;
  }

  tft.drawFastHLine(0, y + 2, 320, TFT_DARKGREY);
  int by = y + 8;
  drawSelectButton(20, by, 120, 30, "BUY", cursor == SEL_OK, TFT_GREEN);
  drawSelectButton(170, by, 130, 30, "CLEAR", cursor == SEL_CLEAR, TFT_RED);

  tft.setTextSize(1);
  tft.setTextColor(TFT_DARKGREY, TFT_BLACK);
  tft.setCursor(8, by + 36);
  tft.println("Joy U/D move  L/R qty  Press pick  A cancel");
}

// Returns true and fills timesOut[] if the customer confirmed a non-empty,
// affordable cart. Returns false on cancel / empty.
bool selectionPage(int* timesOut) {
  int times[SERVO_NUM] = {0, 0, 0, 0};
  int cursor = 0;
  drawSelectDashboard(cursor, times);

  bool pUp = digitalRead(WIO_5S_UP) == LOW;
  bool pDown = digitalRead(WIO_5S_DOWN) == LOW;
  bool pLeft = digitalRead(WIO_5S_LEFT) == LOW;
  bool pRight = digitalRead(WIO_5S_RIGHT) == LOW;
  bool pPress = digitalRead(WIO_5S_PRESS) == LOW;
  bool pA = digitalRead(WIO_KEY_A) == LOW;

  while (true) {
    bool up = digitalRead(WIO_5S_UP) == LOW;
    bool down = digitalRead(WIO_5S_DOWN) == LOW;
    bool left = digitalRead(WIO_5S_LEFT) == LOW;
    bool right = digitalRead(WIO_5S_RIGHT) == LOW;
    bool press = digitalRead(WIO_5S_PRESS) == LOW;
    bool a = digitalRead(WIO_KEY_A) == LOW;
    bool changed = false;

    if (down && !pDown) { cursor = (cursor + 1) % SEL_ITEMS; changed = true; }
    if (up && !pUp)     { cursor = (cursor + SEL_ITEMS - 1) % SEL_ITEMS; changed = true; }

    if (cursor < SERVO_NUM) {
      int mx = maxQtyFor(cursor);
      if (right && !pRight) { if (times[cursor] < mx) times[cursor]++; changed = true; }
      if (left && !pLeft)   { if (times[cursor] > 0) times[cursor]--; changed = true; }
    }

    if (press && !pPress) {
      if (cursor < SERVO_NUM) {
        int mx = maxQtyFor(cursor);
        if (times[cursor] < mx) times[cursor]++;
        changed = true;
      } else if (cursor == SEL_OK) {
        bool any = false;
        for (int i = 0; i < SERVO_NUM; i++) if (times[i] > 0) any = true;
        if (!any) {
          displayScreen("SELECT", "Nothing picked", "Choose an item", "", TFT_YELLOW);
          delay(1200); drawSelectDashboard(cursor, times);
        } else if (cartTotal(times) > selBalance + 0.0001) {
          displayScreen("SELECT", "Not enough", "balance", "", TFT_RED);
          delay(1200); drawSelectDashboard(cursor, times);
        } else {
          for (int i = 0; i < SERVO_NUM; i++) timesOut[i] = times[i];
          return true;
        }
      } else { // SEL_CLEAR
        for (int i = 0; i < SERVO_NUM; i++) times[i] = 0;
        changed = true;
      }
    }

    if (a && !pA) return false;   // cancel

    pUp = up; pDown = down; pLeft = left; pRight = right; pPress = press; pA = a;
    if (changed) drawSelectDashboard(cursor, times);
    delay(30);
  }
}

// ---------------- FLOWS ----------------
void resetSession() {
  currentCardUID = "";
  currentUserName = "";
  currentOrderNumber = "";
  state = AUTH;
}

void runDirect() {
  int code = 0;
  String body = "{";
  body += "\"type\":\"direct\",";
  body += "\"user_name\":\"" + jsonEscape(currentUserName) + "\",";
  body += "\"order_number\":\"" + jsonEscape(currentOrderNumber) + "\",";
  body += "\"rfid_card_uid\":\"" + jsonEscape(currentCardUID) + "\"";
  body += "}";
  String resp = postJsonToBackend("/api/frontend/verify-card", body, code);

  if (!(code >= 200 && code < 300) || resp.indexOf("\"allow_dispense\":true") < 0) {
    if (resp.indexOf("needs_refill") >= 0) displayScreen("SOLD OUT", "Needs refill", "See booth staff", "", TFT_RED);
    else if (resp.indexOf("already used") >= 0) displayScreen("USED", "Already collected", "", "", TFT_RED);
    else if (resp.indexOf("not found") >= 0) displayScreen("NOT FOUND", "Order not found", "See booth staff", "", TFT_RED);
    else displayScreen("DENIED", "Not approved", "See booth staff", "", TFT_RED);
    delay(1800);
    return;
  }

  // Per-servo dispense counts. Multi-product direct orders return times[1..4];
  // single-product orders also return times (plus servo_id/quantity fallback).
  float tmp[SERVO_NUM];
  jsonNumberArray(resp, "times", tmp, SERVO_NUM);
  int times[SERVO_NUM];
  int total = 0;
  for (int i = 0; i < SERVO_NUM; i++) { times[i] = (int)tmp[i]; total += times[i]; }
  if (total <= 0) {
    // Fallback for a single-product response without a times[] array.
    int servoId = jsonValue(resp, "servo_id").toInt();
    int quantity = jsonValue(resp, "quantity").toInt();
    if (servoId >= 1 && servoId <= SERVO_NUM && quantity >= 1) {
      for (int i = 0; i < SERVO_NUM; i++) times[i] = 0;
      times[servoId - 1] = quantity;
      total = quantity;
    }
  }
  if (total <= 0) {
    displayScreen("ERROR", "Nothing to dispense", "See booth staff", "", TFT_RED);
    reportDispenseComplete(currentOrderNumber, false, "empty plan");
    delay(1800);
    return;
  }
  // Every selected column must have a servo present before we dispense anything.
  for (int i = 0; i < SERVO_NUM; i++) {
    if (times[i] > 0 && !present[i]) {
      displayScreen("ERROR", "Servo offline", "See booth staff", "", TFT_RED);
      reportDispenseComplete(currentOrderNumber, false, "servo not present");
      delay(1800);
      return;
    }
  }

  displayScreen("APPROVED", "Dispensing now", "", "", TFT_GREEN);
  delay(700);
  for (int i = 0; i < SERVO_NUM; i++) {
    if (times[i] > 0) dispenseServo(i, times[i], currentUserName.c_str());
  }

  bool ok = reportDispenseComplete(currentOrderNumber, true, "dispensed");
  displayScreen("DONE", ok ? "Enjoy!" : "Enjoy! (report?)", "", "", TFT_GREEN);
  delay(1500);
}

void runSelecting() {
  int code = 0;
  String body = "{";
  body += "\"type\":\"selecting\",";
  body += "\"user_name\":\"" + jsonEscape(currentUserName) + "\",";
  body += "\"rfid_card_uid\":\"" + jsonEscape(currentCardUID) + "\"";
  body += "}";
  String resp = postJsonToBackend("/api/frontend/verify-card", body, code);

  if (!(code >= 200 && code < 300) || resp.indexOf("\"allow_dispense\":true") < 0) {
    if (resp.indexOf("not found") >= 0) displayScreen("NO CARD", "Card not known", "See booth staff", "", TFT_RED);
    else displayScreen("DENIED", "Not approved", "See booth staff", "", TFT_RED);
    delay(1800);
    return;
  }

  selBalance = jsonValue(resp, "balance").toFloat();
  float tmp[SERVO_NUM];
  jsonNumberArray(resp, "stock", tmp, SERVO_NUM);      for (int i = 0; i < SERVO_NUM; i++) selStock[i] = (long)tmp[i];
  jsonNumberArray(resp, "price", selPrice, SERVO_NUM);
  jsonNumberArray(resp, "needs_refill", tmp, SERVO_NUM); for (int i = 0; i < SERVO_NUM; i++) selNeeds[i] = (long)tmp[i];
  jsonNumberArray(resp, "active", tmp, SERVO_NUM);     for (int i = 0; i < SERVO_NUM; i++) selActive[i] = (long)tmp[i];
  splitPipe(jsonValue(resp, "name"), selNames, SERVO_NUM);

  int times[SERVO_NUM] = {0, 0, 0, 0};
  if (!selectionPage(times)) { displayScreen("CANCELLED", "No purchase", "", "", TFT_YELLOW); delay(1200); return; }

  // Make sure every picked servo is physically present before we spend money.
  for (int i = 0; i < SERVO_NUM; i++) {
    if (times[i] > 0 && !present[i]) {
      displayScreen("ERROR", "Servo offline", "See booth staff", "", TFT_RED);
      delay(1800);
      return;
    }
  }

  String items = "[";
  for (int i = 0; i < SERVO_NUM; i++) { items += String(times[i]); if (i < SERVO_NUM - 1) items += ","; }
  items += "]";

  code = 0;
  String cbody = "{";
  cbody += "\"user_name\":\"" + jsonEscape(currentUserName) + "\",";
  cbody += "\"rfid_card_uid\":\"" + jsonEscape(currentCardUID) + "\",";
  cbody += "\"items\":" + items;
  cbody += "}";
  String cresp = postJsonToBackend("/api/frontend/selecting/checkout", cbody, code);

  if (!(code >= 200 && code < 300) || cresp.indexOf("\"allow_dispense\":true") < 0) {
    if (cresp.indexOf("insufficient_balance") >= 0) displayScreen("DENIED", "Low balance", "", "", TFT_RED);
    else if (cresp.indexOf("needs_refill") >= 0) displayScreen("SOLD OUT", "Needs refill", "See booth staff", "", TFT_RED);
    else displayScreen("DENIED", "Not approved", "See booth staff", "", TFT_RED);
    delay(1800);
    return;
  }

  String selOrder = jsonValue(cresp, "order_number");
  float newBalance = jsonValue(cresp, "new_balance").toFloat();

  displayScreen("APPROVED", "Dispensing now", "", "", TFT_GREEN);
  delay(700);
  for (int i = 0; i < SERVO_NUM; i++) {
    if (times[i] > 0) dispenseServo(i, times[i], currentUserName.c_str());
  }

  reportDispenseComplete(selOrder, true, "dispensed");
  char line[32];
  snprintf(line, sizeof(line), "Balance $%.2f", newBalance);
  displayScreen("DONE", "Enjoy!", line, "", TFT_GREEN);
  delay(1800);
}

void scanRFIDCard() {
  if (!rfidReady || state != AUTH) return;
  if (!mfrc522.PICC_IsNewCardPresent()) return;
  if (!mfrc522.PICC_ReadCardSerial()) return;

  currentCardUID = getScannedUIDString();
  Serial.print("[RFID] UID: "); Serial.println(currentCardUID);
  displayScreen("Checking...", "Card detected", "Please wait", "", TFT_CYAN);

  String payload = "";
  bool readOk = readPayloadFromCard(payload);
  stopRFID();
  delay(200);

  if (!readOk || payload.length() == 0) {
    displayScreen("CARD ERROR", "No valid data", "See booth staff", "", TFT_RED);
    delay(1500);
    resetSession();
    showWelcome();
    return;
  }

  String type = jsonValue(payload, "type");
  currentUserName = jsonValue(payload, "user_name");
  currentOrderNumber = jsonValue(payload, "order_number");

  if (currentUserName.length() == 0) {
    displayScreen("CARD ERROR", "No user on card", "See booth staff", "", TFT_RED);
    delay(1500);
    resetSession();
    showWelcome();
    return;
  }

  if (type == "selecting") {
    runSelecting();
  } else if (type == "direct" || currentOrderNumber.length() > 0) {
    runDirect();
  } else {
    displayScreen("CARD ERROR", "Unknown type", "See booth staff", "", TFT_RED);
    delay(1500);
  }

  resetSession();
  showWelcome();
}

// ---------------- SETUP / LOOP ----------------
void setup() {
  Serial.begin(115200);

  tft.init();
  tft.setRotation(3);
  tft.fillScreen(TFT_BLACK);

  Serial1.begin(1000000);
  st.pSerial = &Serial1;
  delay(200);

  for (int i = 0; i < SERVO_NUM; i++) {
    present[i] = (st.Ping(ID[i]) != -1);
    if (present[i]) st.EnableTorque(ID[i], 1);
    else { Serial.print("[SERVO] WARNING id "); Serial.print(ID[i]); Serial.println(" not found"); }
  }
  homeAllToZero();

  pinMode(WIO_KEY_A, INPUT_PULLUP);
  pinMode(WIO_KEY_B, INPUT_PULLUP);
  pinMode(WIO_KEY_C, INPUT_PULLUP);
  pinMode(WIO_5S_UP, INPUT_PULLUP);
  pinMode(WIO_5S_DOWN, INPUT_PULLUP);
  pinMode(WIO_5S_LEFT, INPUT_PULLUP);
  pinMode(WIO_5S_RIGHT, INPUT_PULLUP);
  pinMode(WIO_5S_PRESS, INPUT_PULLUP);

  for (byte i = 0; i < 6; i++) rfidKey.keyByte[i] = 0xFF;

  connectWiFi();
  initRFID();          // sets state to AUTH when the reader answers
  showWelcome();
}

void loop() {
  if (!rfidReady) {
    if (digitalRead(WIO_KEY_A) == LOW) { initRFID(); delay(400); }
    return;
  }
  scanRFIDCard();
  delay(40);
}
