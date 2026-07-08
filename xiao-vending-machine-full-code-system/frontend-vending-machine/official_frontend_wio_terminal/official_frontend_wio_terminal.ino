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

// ---------------- DISPLAY (Seeed Studio branded UI) ----------------
// 320x240 redesign matching the static mockups in
// frontend-vending-machine/ui-for-each-phase. Only TFT_eSPI primitives are
// used so the whole look is portable. Palette in RGB565:
//   Seeed Green #8FC31F  +  deep "Seeed Blue" navy screens.
#define S565(r, g, b) ((uint16_t)((((r) & 0xF8) << 8) | (((g) & 0xFC) << 3) | ((b) >> 3)))
static const uint16_t C_BG      = S565(6, 40, 62);     // #06283E navy screen
static const uint16_t C_BG2     = S565(11, 46, 68);    // row / card surface
static const uint16_t C_BAR     = S565(1, 17, 28);     // status + hint bars
static const uint16_t C_GREEN   = S565(143, 195, 31);  // Seeed Green
static const uint16_t C_GREEN_D = S565(110, 154, 22);  // deep green
static const uint16_t C_INK     = S565(234, 244, 249); // near-white text
static const uint16_t C_MUTED   = S565(143, 174, 194); // secondary text
static const uint16_t C_AMBER   = S565(255, 176, 32);
static const uint16_t C_RED     = S565(255, 91, 98);
static const uint16_t C_INFO    = S565(67, 180, 228);
static const uint16_t C_LINE    = S565(30, 60, 82);
static const uint16_t C_GREENDIM = S565(20, 42, 10);

#define GLYPH_NONE  0
#define GLYPH_CHECK 1
#define GLYPH_CROSS 2
#define GLYPH_WARN  3
#define GLYPH_INFO  4
#define GLYPH_CARD  5
#define GLYPH_CLOCK 6
#define GLYPH_BOX   7
#define GLYPH_SPIN  8
#define GLYPH_LEAF  9
#define GLYPH_AUTO  255

void thickLine(int x0, int y0, int x1, int y1, uint16_t col, int t) {
  for (int i = -(t / 2); i <= t / 2; i++) {
    tft.drawLine(x0, y0 + i, x1, y1 + i, col);
    tft.drawLine(x0 + i, y0, x1 + i, y1, col);
  }
}

void drawGlyph(int cx, int cy, uint8_t g, uint16_t col) {
  switch (g) {
    case GLYPH_CHECK:
      thickLine(cx - 11, cy + 1, cx - 3, cy + 9, col, 3);
      thickLine(cx - 3, cy + 9, cx + 12, cy - 8, col, 3);
      break;
    case GLYPH_CROSS:
      thickLine(cx - 9, cy - 9, cx + 9, cy + 9, col, 3);
      thickLine(cx + 9, cy - 9, cx - 9, cy + 9, col, 3);
      break;
    case GLYPH_WARN:
      tft.drawTriangle(cx, cy - 13, cx - 14, cy + 11, cx + 14, cy + 11, col);
      tft.drawTriangle(cx, cy - 12, cx - 13, cy + 10, cx + 13, cy + 10, col);
      tft.fillRect(cx - 1, cy - 5, 3, 9, col);
      tft.fillRect(cx - 1, cy + 7, 3, 3, col);
      break;
    case GLYPH_INFO:
      tft.drawCircle(cx, cy, 13, col);
      tft.drawCircle(cx, cy, 12, col);
      tft.fillRect(cx - 1, cy - 7, 3, 3, col);
      tft.fillRect(cx - 1, cy - 2, 3, 10, col);
      break;
    case GLYPH_CARD:
      tft.drawRoundRect(cx - 14, cy - 10, 20, 20, 3, col);
      tft.drawRoundRect(cx - 13, cy - 9, 18, 18, 3, col);
      tft.fillRect(cx - 10, cy - 5, 7, 5, col);
      tft.drawFastVLine(cx + 10, cy - 6, 12, col);
      tft.drawFastVLine(cx + 13, cy - 8, 16, col);
      break;
    case GLYPH_CLOCK:
      tft.drawCircle(cx, cy, 13, col);
      tft.drawCircle(cx, cy, 12, col);
      thickLine(cx, cy, cx, cy - 7, col, 2);
      thickLine(cx, cy, cx + 5, cy + 3, col, 2);
      break;
    case GLYPH_BOX:
      tft.drawRect(cx - 12, cy - 6, 24, 16, col);
      tft.drawRect(cx - 12, cy - 7, 24, 17, col);
      tft.drawFastHLine(cx - 12, cy + 1, 24, col);
      tft.fillTriangle(cx - 12, cy - 6, cx, cy - 12, cx, cy - 6, col);
      tft.fillTriangle(cx + 12, cy - 6, cx, cy - 12, cx, cy - 6, col);
      break;
    case GLYPH_SPIN: {
      const int px[8] = {0, 10, 14, 10, 0, -10, -14, -10};
      const int py[8] = {-14, -10, 0, 10, 14, 10, 0, -10};
      for (int i = 0; i < 8; i++) {
        uint16_t c = (i == 0) ? col : (i == 7 ? C_GREEN_D : C_LINE);
        tft.fillCircle(cx + px[i], cy + py[i], 2, c);
      }
      break;
    }
    case GLYPH_LEAF:
      thickLine(cx, cy + 13, cx, cy - 3, col, 3);
      tft.fillTriangle(cx - 1, cy + 3, cx - 15, cy - 3, cx - 3, cy - 11, col);
      tft.fillTriangle(cx + 1, cy - 3, cx + 15, cy - 9, cx + 3, cy - 15, C_GREEN_D);
      break;
    default: break;
  }
}

void drawMedallion(int cx, int cy, uint8_t glyph, uint16_t col) {
  uint16_t dim = C_BG2;
  if (col == C_GREEN) dim = S565(20, 42, 10);
  else if (col == C_RED) dim = S565(50, 16, 18);
  else if (col == C_AMBER) dim = S565(50, 36, 6);
  else if (col == C_INFO) dim = S565(8, 36, 50);
  tft.fillCircle(cx, cy, 30, dim);
  tft.drawCircle(cx, cy, 30, col);
  tft.drawCircle(cx, cy, 29, col);
  if (glyph != GLYPH_NONE) drawGlyph(cx, cy, glyph, col);
}

// persistent seeed studio brand bar + live wifi indicator (top 26 px)
void drawStatusBar() {
  tft.fillRect(0, 0, 320, 26, C_BAR);
  tft.drawFastHLine(0, 26, 320, C_GREEN);
  tft.fillRoundRect(9, 7, 12, 12, 3, C_GREEN);
  tft.setTextSize(1);
  tft.setTextDatum(TL_DATUM);
  tft.setTextColor(C_GREEN, C_BAR);
  tft.drawString("seeed", 27, 9);
  tft.setTextColor(C_MUTED, C_BAR);
  tft.drawString("studio", 59, 9);
  bool wl = (WiFi.status() == WL_CONNECTED);
  uint16_t wc = wl ? C_GREEN : C_RED;
  tft.setTextDatum(TR_DATUM);
  tft.setTextColor(wc, C_BAR);
  tft.drawString(wl ? "online" : "offline", 298, 9);
  tft.fillCircle(309, 13, 3, wc);
}

void drawHintBar(const char* txt) {
  tft.fillRect(0, 214, 320, 26, C_BAR);
  tft.drawFastHLine(0, 214, 320, C_LINE);
  tft.setTextSize(1);
  tft.setTextDatum(ML_DATUM);
  tft.setTextColor(C_MUTED, C_BAR);
  tft.drawString(txt, 12, 228);
}

uint8_t fitSize(const char* s, int maxw, uint8_t maxSize) {
  int len = strlen(s);
  uint8_t sz = maxSize;
  while (sz > 1 && len * 6 * sz > maxw) sz--;
  return sz;
}

// Full-detail message screen: title=eyebrow (small, coloured), l1=headline,
// l2/l3=subtitle lines, colour selects the accent, glyph the status icon.
void displayScreenEx(const char* title, const char* l1, const char* l2,
                     const char* l3, uint16_t color, uint8_t glyph, const char* hint) {
  tft.fillScreen(C_BG);
  drawStatusBar();

  uint16_t accent = color;
  uint8_t g = glyph;
  if (color == TFT_GREEN)       { accent = C_GREEN; if (g == GLYPH_AUTO) g = GLYPH_CHECK; }
  else if (color == TFT_RED)    { accent = C_RED;   if (g == GLYPH_AUTO) g = GLYPH_CROSS; }
  else if (color == TFT_YELLOW) { accent = C_AMBER; if (g == GLYPH_AUTO) g = GLYPH_WARN; }
  else if (color == TFT_CYAN)   { accent = C_INFO;  if (g == GLYPH_AUTO) g = GLYPH_INFO; }
  else if (g == GLYPH_AUTO)     { g = GLYPH_NONE; }

  int y;
  if (g != GLYPH_NONE) { drawMedallion(160, 80, g, accent); y = 120; }
  else { y = 74; }

  tft.setTextDatum(TC_DATUM);
  if (title && title[0]) {
    tft.setTextSize(1);
    tft.setTextColor(accent, C_BG);
    tft.drawString(title, 160, y);
    y += 16;
  }
  if (l1 && l1[0]) {
    uint8_t ts = fitSize(l1, 300, 3);
    tft.setTextSize(ts);
    tft.setTextColor(C_INK, C_BG);
    tft.drawString(l1, 160, y);
    y += (ts >= 3 ? 30 : (ts == 2 ? 22 : 14));
  }
  tft.setTextSize(1);
  tft.setTextColor(C_MUTED, C_BG);
  if (l2 && l2[0]) { tft.drawString(l2, 160, y); y += 15; }
  if (l3 && l3[0]) { tft.drawString(l3, 160, y); y += 15; }

  drawHintBar(hint ? hint : "seeed studio   -   XIAO Vending");
}

// Backwards-compatible 5-arg entry used across the flows (auto glyph, no hint).
void displayScreen(const char* title, const char* l1, const char* l2, const char* l3, uint16_t color) {
  displayScreenEx(title, l1, l2, l3, color, GLYPH_AUTO, nullptr);
}

void showWelcome() {
  tft.fillScreen(C_BG);
  drawStatusBar();
  tft.setTextDatum(TC_DATUM);
  if (!rfidReady) {
    drawMedallion(160, 84, GLYPH_CARD, C_AMBER);
    tft.setTextSize(1); tft.setTextColor(C_AMBER, C_BG);
    tft.drawString("READER OFF", 160, 126);
    tft.setTextSize(3); tft.setTextColor(C_INK, C_BG);
    tft.drawString("Press A", 160, 144);
    tft.setTextSize(1); tft.setTextColor(C_MUTED, C_BG);
    tft.drawString("to start the RFID reader", 160, 182);
    drawHintBar("Press button A to begin");
  } else {
    drawMedallion(160, 80, GLYPH_CARD, C_GREEN);
    tft.setTextSize(1); tft.setTextColor(C_GREEN, C_BG);
    tft.drawString("WELCOME", 160, 120);
    tft.setTextSize(3); tft.setTextColor(C_INK, C_BG);
    tft.drawString("Scan your card", 160, 138);
    tft.setTextSize(1); tft.setTextColor(C_MUTED, C_BG);
    tft.drawString("Collect an order or shop your balance", 160, 176);
    drawHintBar("Tap a card on the reader");
  }
}

void showDispenseProgress(const char* who, byte id, int t, int times) {
  tft.fillScreen(C_BG);
  drawStatusBar();
  char buf[40];
  tft.setTextDatum(TL_DATUM);
  tft.setTextSize(1); tft.setTextColor(C_GREEN, C_BG);
  snprintf(buf, sizeof(buf), "DISPENSING  -  ITEM %d OF %d", t, times);
  tft.drawString(buf, 18, 44);
  tft.setTextSize(3); tft.setTextColor(C_INK, C_BG);
  snprintf(buf, sizeof(buf), "Column %d", id);
  tft.drawString(buf, 18, 66);
  tft.setTextSize(2); tft.setTextColor(C_MUTED, C_BG);
  snprintf(buf, sizeof(buf), "Servo %d", id);
  tft.drawString(buf, 18, 104);
  tft.setTextSize(1); tft.setTextColor(C_MUTED, C_BG);
  snprintf(buf, sizeof(buf), "Card: %s", who);
  tft.drawString(buf, 18, 134);
  tft.setTextDatum(TR_DATUM); tft.setTextSize(2); tft.setTextColor(C_GREEN, C_BG);
  snprintf(buf, sizeof(buf), "%d/%d", t, times);
  tft.drawString(buf, 302, 100);
  int bx = 18, by = 168, bw = 284, bh = 14;
  tft.drawRoundRect(bx, by, bw, bh, 4, C_LINE);
  float frac = times > 0 ? (float)t / times : 0;
  int fw = (int)((bw - 4) * frac);
  if (fw > 0) tft.fillRoundRect(bx + 2, by + 2, fw, bh - 4, 3, C_GREEN);
  drawHintBar("Please wait  -  keep the card in place");
}

void showBootSplash() {
  tft.fillScreen(C_BG);
  drawStatusBar();
  drawMedallion(160, 84, GLYPH_LEAF, C_GREEN);
  tft.setTextDatum(TC_DATUM);
  tft.setTextSize(3); tft.setTextColor(C_INK, C_BG);
  tft.drawString("XIAO Vending", 160, 128);
  tft.setTextSize(1); tft.setTextColor(C_MUTED, C_BG);
  tft.drawString("Powered by seeed studio", 160, 162);
  drawHintBar("Starting up  -  homing servos");
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

  tft.fillScreen(C_BG);
  drawStatusBar();
  drawMedallion(160, 80, GLYPH_SPIN, C_INFO);
  tft.setTextDatum(TC_DATUM);
  tft.setTextSize(1); tft.setTextColor(C_INFO, C_BG);
  tft.drawString("CONNECTING", 160, 118);
  tft.setTextSize(2); tft.setTextColor(C_INK, C_BG);
  tft.drawString("Joining Wi-Fi", 160, 134);
  tft.setTextSize(1); tft.setTextColor(C_MUTED, C_BG);
  tft.drawString((String("SSID  ") + WIFI_SSID).c_str(), 160, 160);
  drawHintBar("Connecting to Wi-Fi...");

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

    tft.fillRect(0, 176, 320, 32, C_BG);
    tft.setTextDatum(TC_DATUM);
    tft.setTextSize(1); tft.setTextColor(C_MUTED, C_BG);
    {
      char at[40];
      snprintf(at, sizeof(at), "Attempt %d / %d   %s", attempts, MAX_ATTEMPTS, wifiStatusText(s));
      tft.drawString(at, 160, 180);
    }
    int bx = 60, by = 194, bw = 200, bh = 8;
    tft.drawRoundRect(bx, by, bw, bh, 3, C_LINE);
    int fw = (int)((bw - 2) * ((float)attempts / MAX_ATTEMPTS));
    if (fw > 0) tft.fillRoundRect(bx + 1, by + 1, fw, bh - 2, 2, C_GREEN);

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
  if (hl) {
    tft.fillRoundRect(x, y, w, h, 6, accent);
    tft.setTextColor(C_BG, accent);
  } else {
    tft.fillRoundRect(x, y, w, h, 6, C_BG);
    tft.drawRoundRect(x, y, w, h, 6, accent);
    tft.setTextColor(accent, C_BG);
  }
  tft.setTextDatum(MC_DATUM);
  tft.setTextSize(2);
  tft.drawString(label, x + w / 2, y + h / 2);
}

void drawSelectDashboard(int cursor, const int* times) {
  tft.fillScreen(C_BG);

  // header + right-aligned brand tag
  tft.setTextDatum(TL_DATUM);
  tft.setTextSize(2); tft.setTextColor(C_GREEN, C_BG);
  tft.drawString("SELECT", 10, 8);
  tft.setTextColor(C_INK, C_BG);
  tft.drawString("PRODUCTS", 88, 8);
  tft.setTextDatum(TR_DATUM); tft.setTextSize(1); tft.setTextColor(C_MUTED, C_BG);
  tft.drawString("seeed studio", 310, 6);

  // balance strip
  float total = cartTotal(times);
  float left = selBalance - total;
  tft.setTextDatum(TL_DATUM); tft.setTextSize(1);
  tft.setTextColor(C_MUTED, C_BG);
  tft.drawString((String("Bal $") + String(selBalance, 2)).c_str(), 10, 31);
  tft.drawString((String("Cost $") + String(total, 2)).c_str(), 120, 31);
  tft.setTextColor(left < 0 ? C_RED : C_GREEN, C_BG);
  tft.drawString((String("Left $") + String(left, 2)).c_str(), 220, 31);
  tft.drawFastHLine(8, 44, 304, C_LINE);

  // one row per servo/column
  const int rowH = 27, gap = 2, top = 48;
  for (int i = 0; i < SERVO_NUM; i++) {
    int y = top + i * (rowH + gap);
    int cy = y + rowH / 2;
    bool hl = (cursor == i);
    bool sellable = (selStock[i] > 0 && selActive[i] == 1);
    uint16_t rowbg = hl ? C_GREENDIM : C_BG2;
    tft.fillRoundRect(6, y, 308, rowH, 5, rowbg);
    if (hl) tft.drawRoundRect(6, y, 308, rowH, 5, C_GREEN);

    tft.setTextDatum(ML_DATUM); tft.setTextSize(2);
    tft.setTextColor(hl ? C_GREEN : C_MUTED, rowbg);
    tft.drawString(String(ID[i]).c_str(), 16, cy);

    String nm = selNames[i]; if (nm.length() == 0) nm = "Product";
    if (nm.length() > 13) nm = nm.substring(0, 13);
    tft.setTextColor(!sellable ? C_MUTED : C_INK, rowbg);
    tft.drawString(nm.c_str(), 36, cy);

    tft.setTextSize(1); tft.setTextColor(C_MUTED, rowbg);
    tft.setTextDatum(MR_DATUM);
    tft.drawString((String("$") + String(selPrice[i], 2)).c_str(), 250, cy);

    uint16_t cntcol = (times[i] > 0) ? C_GREEN : (sellable ? C_INK : C_MUTED);
    if (selStock[i] <= 0) cntcol = C_RED;
    else if (selNeeds[i]) cntcol = C_AMBER;
    tft.setTextSize(2); tft.setTextColor(cntcol, rowbg);
    tft.drawString((String(times[i]) + "/" + String((int)selStock[i])).c_str(), 306, cy);
  }

  int by = top + SERVO_NUM * (rowH + gap) + 4;
  drawSelectButton(10, by, 180, 30, "BUY", cursor == SEL_OK, C_GREEN);
  drawSelectButton(200, by, 110, 30, "CLEAR", cursor == SEL_CLEAR, C_RED);

  drawHintBar("Joy move   L/R qty   Press pick   A cancel");
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
    if (resp.indexOf("needs_refill") >= 0) displayScreenEx("SOLD OUT", "Needs refill", "See booth staff", "", C_AMBER, GLYPH_BOX, "Staff refill from the dashboard");
    else if (resp.indexOf("already used") >= 0) displayScreenEx("USED", "Already collected", "One collection per card", "", C_RED, GLYPH_CLOCK, "Ask staff for a new card");
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
    else if (cresp.indexOf("needs_refill") >= 0) displayScreenEx("SOLD OUT", "Needs refill", "See booth staff", "", C_AMBER, GLYPH_BOX, "Staff refill from the dashboard");
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
  displayScreenEx("CARD DETECTED", "Reading...", "Hold your card still", "", C_INFO, GLYPH_SPIN, "Authenticating card");

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
  showBootSplash();
  delay(1200);

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
