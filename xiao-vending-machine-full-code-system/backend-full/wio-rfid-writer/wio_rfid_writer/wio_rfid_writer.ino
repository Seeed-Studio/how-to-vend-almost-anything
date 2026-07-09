/*
  Wio Terminal RFID Writer for Backend Center

  Hardware:
  - Wio Terminal
  - Emakefun MFRC522 I2C RFID module, default I2C address 0x28
  - Connect RFID: 5V, GND, SDA, SCL to the Wio Terminal I2C/Grove I2C pins

  Behavior:
  1. Power up
  2. Check RFID module and card presence
  3. Check backend-center connection
  4. Poll backend-center for pending RFID write jobs
  5. When a card is present, write the job payload to the card:
       - ORDER   job -> {"type":"direct","user_name":..,"order_number":..,"v":1}
       - BALANCE job -> {"type":"selecting","user_name":..,"v":1}
  6. Report result to backend-center

  Flash this sketch to the backend Wio Terminal ONCE. It then stays connected
  over WiFi and writes any queued card - there is no per-card upload.

  Libraries required:
  - Seeed Wio Terminal board support
  - Seeed_Arduino_rpcWiFi / rpcWiFi
  - Seeed LCD library / TFT_eSPI included by Wio Terminal board package
  - Emakefun_RFID.cpp / Emakefun_RFID.h copied in this sketch folder
*/

#include <Arduino.h>
#include <Wire.h>
#include <TFT_eSPI.h>
#include <rpcWiFi.h>
#include <HTTPClient.h>
#include "Emakefun_RFID.h"

// ---------------- User config ----------------
const char* WIFI_SSID = "Your wifi name";
const char* WIFI_PASSWORD = "Your wifi password";
const char* API_BASE = "http://192.168.120.94:3000";  // example: http://192.168.1.20:3000
const char* DEVICE_ID = "wio-rfid-writer";
const char* API_KEY = "WIO_WRITER_SECRET";

// ---------------- RFID ----------------
#define RFID_ADDR 0x28
MFRC522 mfrc522(RFID_ADDR);
MFRC522::MIFARE_Key key;

// Data blocks for MIFARE Classic 1K. Do not write sector trailer blocks 7 or 11.
const byte DATA_BLOCKS[] = {4, 5, 6, 8, 9, 10};
const int DATA_BLOCK_COUNT = sizeof(DATA_BLOCKS) / sizeof(DATA_BLOCKS[0]);
const int MAX_PAYLOAD_LEN = DATA_BLOCK_COUNT * 16;

// ---------------- UI ----------------
TFT_eSPI tft;
String currentJobId = "";
String currentOrderNumber = "";
String currentPayload = "";
String lastCardUid = "";
bool rfidReady = false;
bool serverConnected = false;
bool cardPresent = false;
unsigned long lastPollMs = 0;
unsigned long lastStatusMs = 0;

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
  return json.substring(p, end);
}

// ---------------- DISPLAY (Seeed Studio branded UI) ----------------
// Matches the customer-facing reader (official_frontend_wio_terminal): same
// palette + status/hint bars + status medallions, so the two Wio Terminals
// look like one product. 320x240, TFT_eSPI primitives only.
#define S565(r, g, b) ((uint16_t)((((r) & 0xF8) << 8) | (((g) & 0xFC) << 3) | ((b) >> 3)))
static const uint16_t C_BG      = S565(6, 40, 62);
static const uint16_t C_BG2     = S565(11, 46, 68);
static const uint16_t C_BAR     = S565(1, 17, 28);
static const uint16_t C_GREEN   = S565(143, 195, 31);
static const uint16_t C_GREEN_D = S565(110, 154, 22);
static const uint16_t C_INK     = S565(234, 244, 249);
static const uint16_t C_MUTED   = S565(143, 174, 194);
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
#define GLYPH_SPIN  8
#define GLYPH_LEAF  9

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

void drawStatusPill(int x, int y, int w, const char* label, const char* val, uint16_t col) {
  tft.fillRoundRect(x, y, w, 34, 7, C_BG2);
  tft.drawRoundRect(x, y, w, 34, 7, C_LINE);
  tft.setTextDatum(TC_DATUM);
  tft.setTextSize(1);
  tft.setTextColor(C_MUTED, C_BG2);
  tft.drawString(label, x + w / 2, y + 6);
  tft.setTextColor(col, C_BG2);
  tft.drawString(val, x + w / 2, y + 19);
}

// Big centered feedback screen (card detected / writing / success / failed).
void drawState(const char* eyebrow, const char* title, const char* subtitle,
               uint8_t glyph, uint16_t accent, const char* hint) {
  tft.fillScreen(C_BG);
  drawStatusBar();
  drawMedallion(160, 84, glyph, accent);
  tft.setTextDatum(TC_DATUM);
  tft.setTextSize(1); tft.setTextColor(accent, C_BG);
  tft.drawString(eyebrow, 160, 126);
  uint8_t ts = fitSize(title, 300, 3);
  tft.setTextSize(ts); tft.setTextColor(C_INK, C_BG);
  tft.drawString(title, 160, 144);
  tft.setTextSize(1); tft.setTextColor(C_MUTED, C_BG);
  tft.drawString(subtitle, 160, 144 + (ts >= 3 ? 32 : 24));
  drawHintBar(hint);
}

void showBootSplash() {
  tft.fillScreen(C_BG);
  drawStatusBar();
  drawMedallion(160, 84, GLYPH_LEAF, C_GREEN);
  tft.setTextDatum(TC_DATUM);
  tft.setTextSize(3); tft.setTextColor(C_INK, C_BG);
  tft.drawString("RFID Writer", 160, 128);
  tft.setTextSize(1); tft.setTextColor(C_MUTED, C_BG);
  tft.drawString("Powered by seeed studio", 160, 162);
  drawHintBar("Card-writing station  -  starting up");
}

void showConnecting() {
  tft.fillScreen(C_BG);
  drawStatusBar();
  drawMedallion(160, 82, GLYPH_SPIN, C_INFO);
  tft.setTextDatum(TC_DATUM);
  tft.setTextSize(1); tft.setTextColor(C_INFO, C_BG);
  tft.drawString("CONNECTING", 160, 120);
  tft.setTextSize(2); tft.setTextColor(C_INK, C_BG);
  tft.drawString("Joining Wi-Fi", 160, 136);
  tft.setTextSize(1); tft.setTextColor(C_MUTED, C_BG);
  tft.drawString((String("SSID  ") + WIFI_SSID).c_str(), 160, 162);
  drawHintBar("Connecting to the backend network");
}

// Live status dashboard shown while idle / waiting for a job or a card.
void drawDashboard(const String& message) {
  tft.fillScreen(C_BG);
  drawStatusBar();

  tft.setTextDatum(TL_DATUM);
  tft.setTextSize(1); tft.setTextColor(C_GREEN, C_BG);
  tft.drawString("CARD WRITER STATION", 12, 34);

  bool wl = (WiFi.status() == WL_CONNECTED);
  drawStatusPill(8,   48, 71, "WIFI",   wl ? "OK" : "NO",              wl ? C_GREEN : C_RED);
  drawStatusPill(85,  48, 71, "SERVER", serverConnected ? "OK" : "NO", serverConnected ? C_GREEN : C_AMBER);
  drawStatusPill(162, 48, 71, "RFID",   rfidReady ? "OK" : "NO",       rfidReady ? C_GREEN : C_RED);
  drawStatusPill(239, 48, 71, "CARD",   cardPresent ? "YES" : "--",    cardPresent ? C_GREEN : C_MUTED);

  tft.fillRoundRect(8, 88, 304, 74, 8, C_BG2);
  String jobV   = currentJobId.length() ? currentJobId : "-";
  String orderV = currentOrderNumber.length() ? currentOrderNumber : "-";
  String uidV   = lastCardUid.length() ? lastCardUid : "-";
  if (jobV.length() > 22) jobV = jobV.substring(0, 22);
  if (orderV.length() > 22) orderV = orderV.substring(0, 22);
  if (uidV.length() > 22) uidV = uidV.substring(0, 22);
  tft.setTextSize(1); tft.setTextDatum(ML_DATUM);
  tft.setTextColor(C_MUTED, C_BG2); tft.drawString("JOB",      22, 102);
  tft.setTextColor(C_INK,   C_BG2); tft.drawString(jobV.c_str(), 96, 102);
  tft.setTextColor(C_MUTED, C_BG2); tft.drawString("ORDER",    22, 124);
  tft.setTextColor(C_INK,   C_BG2); tft.drawString(orderV.c_str(), 96, 124);
  tft.setTextColor(C_MUTED, C_BG2); tft.drawString("CARD UID", 22, 146);
  tft.setTextColor(C_INK,   C_BG2); tft.drawString(uidV.c_str(), 96, 146);

  uint16_t acc = C_GREEN;
  String m = message; m.toLowerCase();
  if (m.indexOf("fail") >= 0 || m.indexOf("error") >= 0) acc = C_RED;
  else if (m.indexOf("writ") >= 0 || m.indexOf("connect") >= 0 || m.indexOf("detect") >= 0) acc = C_INFO;
  else if (currentJobId.length() > 0) acc = C_AMBER;
  tft.fillRoundRect(8, 168, 304, 32, 8, C_BG2);
  tft.drawRoundRect(8, 168, 304, 32, 8, acc);
  tft.fillCircle(24, 184, 4, acc);
  String mm = message; if (mm.length() > 44) mm = mm.substring(0, 44);
  tft.setTextDatum(ML_DATUM); tft.setTextSize(1); tft.setTextColor(C_INK, C_BG2);
  tft.drawString(mm.c_str(), 38, 184);

  drawHintBar(currentJobId.length() ? "Job queued  -  place a blank card to write"
                                     : "Create an order on the dashboard to queue a card");
}

bool connectWifi() {
  showConnecting();
  WiFi.disconnect(true);          // clear any half-open state
  delay(150);
  WiFi.mode(WIFI_STA);            // rpcWiFi is unreliable without an explicit mode
  delay(150);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
    delay(500);
  }
  return WiFi.status() == WL_CONNECTED;
}

String httpRequest(const String& method, const String& path, const String& body = "") {
  if (WiFi.status() != WL_CONNECTED) return "";
  HTTPClient http;
  String url = String(API_BASE) + path;
  http.begin(url);
  http.setTimeout(8000);   // never block the UI if the backend URL is wrong/unreachable
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-id", DEVICE_ID);
  http.addHeader("x-api-key", API_KEY);
  int code = 0;
  if (method == "GET") code = http.GET();
  else code = http.POST(body);
  String response = "";
  if (code > 0) response = http.getString();
  http.end();
  serverConnected = (code >= 200 && code < 300);
  return response;
}

void sendStatus(const String& message) {
  String body = "{";
  body += "\"rfid_ready\":" + String(rfidReady ? "true" : "false") + ",";
  body += "\"card_present\":" + String(cardPresent ? "true" : "false") + ",";
  body += "\"last_card_uid\":\"" + lastCardUid + "\",";
  body += "\"current_job_id\":\"" + currentJobId + "\",";
  body += "\"message\":\"" + message + "\"";
  body += "}";
  httpRequest("POST", "/api/rfid-writer/status", body);
}

String readUidString() {
  String uid = "";
  for (byte i = 0; i < mfrc522.uid.size; i++) {
    if (mfrc522.uid.uidByte[i] < 0x10) uid += "0";
    uid += String(mfrc522.uid.uidByte[i], HEX);
    if (i + 1 < mfrc522.uid.size) uid += " ";
  }
  uid.toUpperCase();
  return uid;
}

bool authenticateBlock(byte blockAddr) {
  byte status = mfrc522.PCD_Authenticate(MFRC522::PICC_CMD_MF_AUTH_KEY_A, blockAddr, &key, &(mfrc522.uid));
  return status == MFRC522::STATUS_OK;
}

bool writePayloadToCard(const String& payload) {
  if (payload.length() > MAX_PAYLOAD_LEN) return false;
  for (int i = 0; i < DATA_BLOCK_COUNT; i++) {
    byte buffer[16];
    memset(buffer, 0, 16);
    int start = i * 16;
    for (int j = 0; j < 16; j++) {
      int idx = start + j;
      if (idx < payload.length()) buffer[j] = payload[idx];
    }
    byte block = DATA_BLOCKS[i];
    if (!authenticateBlock(block)) return false;
    byte status = mfrc522.MIFARE_Write(block, buffer, 16);
    if (status != MFRC522::STATUS_OK) return false;
  }
  return true;
}

void reportJobResult(bool success, const String& message) {
  String body = "{";
  body += "\"job_id\":\"" + currentJobId + "\",";
  body += "\"success\":" + String(success ? "true" : "false") + ",";
  body += "\"rfid_card_uid\":\"" + lastCardUid + "\",";
  body += "\"message\":\"" + message + "\"";
  body += "}";
  httpRequest("POST", "/api/rfid-writer/job-result", body);
}

void pollJob() {
  if (currentJobId.length() > 0) return;
  String res = httpRequest("GET", "/api/rfid-writer/next-job");
  if (res.length() == 0) return;
  String hasJob = jsonValue(res, "has_job");
  if (hasJob != "true") return;
  currentJobId = jsonValue(res, "job_id");
  String userName = jsonValue(res, "user_name");
  currentOrderNumber = jsonValue(res, "order_number");
  String jobType = jsonValue(res, "job_type");   // ORDER or BALANCE

  // The server stores JSON in CSV, so the raw rfid_payload comes back with
  // escaped quotes. To keep the Arduino-side parser simple and reliable,
  // compose the exact RFID card JSON locally from the plain fields.
  bool ok = false;
  if (jobType == "BALANCE") {
    // Selecting card: the money balance is tracked in the backend by user_name.
    currentPayload = "{\"type\":\"selecting\",\"user_name\":\"" + userName + "\",\"v\":1}";
    ok = currentJobId.length() > 0 && userName.length() > 0;
  } else {
    // Direct order card.
    currentPayload = "{\"type\":\"direct\",\"user_name\":\"" + userName + "\",\"order_number\":\"" + currentOrderNumber + "\",\"v\":1}";
    ok = currentJobId.length() > 0 && userName.length() > 0 && currentOrderNumber.length() > 0;
  }

  if (!ok) {
    currentJobId = "";
    currentOrderNumber = "";
    currentPayload = "";
  }
}

void setup() {
  Serial.begin(115200);
  tft.begin();
  tft.setRotation(3);
  showBootSplash();
  delay(1000);

  Wire1.begin();          // Wio Grove I2C is on Wire1 (see Emakefun_RFID.cpp remap)
  mfrc522.PCD_Init();
  for (byte i = 0; i < 6; i++) key.keyByte[i] = 0xFF;
  rfidReady = true;

  connectWifi();
  sendStatus("Wio RFID writer booted");
  drawDashboard("Ready. Waiting for job/card.");
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWifi();
  }

  if (millis() - lastPollMs > 2000) {
    lastPollMs = millis();
    pollJob();
  }

  cardPresent = false;
  if (mfrc522.PICC_IsNewCardPresent() && mfrc522.PICC_ReadCardSerial()) {
    cardPresent = true;
    lastCardUid = readUidString();
    drawState("CARD DETECTED", "Card found", "Reading the tag", GLYPH_SPIN, C_INFO, "Hold the card on the reader");

    if (currentJobId.length() > 0 && currentPayload.length() > 0) {
      {
        String sub = currentOrderNumber.length() ? (String("Order ") + currentOrderNumber) : String("Balance top-up card");
        drawState("WRITING", "Writing card", sub.c_str(), GLYPH_CARD, C_INFO, "Keep the card still on the reader");
      }
      bool ok = writePayloadToCard(currentPayload);
      if (ok) {
        reportJobResult(true, "RFID card written successfully");
        drawState("SUCCESS", "Card written", "You can remove the card", GLYPH_CHECK, C_GREEN, "Ready for the next job");
        currentJobId = "";
        currentOrderNumber = "";
        currentPayload = "";
      } else {
        reportJobResult(false, "RFID write failed. Check card type/auth/key.");
        drawState("FAILED", "Write failed", "Check card type, then retry", GLYPH_CROSS, C_RED, "Use a MIFARE Classic 1K card");
        currentJobId = "";
        currentOrderNumber = "";
        currentPayload = "";
      }
    }
    mfrc522.PICC_HaltA();
    mfrc522.PCD_StopCrypto1();
    delay(1200);
  }

  if (millis() - lastStatusMs > 3000) {
    lastStatusMs = millis();
    sendStatus(currentJobId.length() ? "Waiting for card to write job" : "Idle. Waiting for server job");
    drawDashboard(currentJobId.length() ? "Place card to write." : "Ready. Create order on server.");
  }
  delay(100);
}
