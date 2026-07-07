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
const char* WIFI_SSID = "SEEED-MKT";
const char* WIFI_PASSWORD = "edgemaker2023";
const char* API_BASE = "http://192.168.7.164:3000";  // example: http://192.168.1.20:3000
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

void drawDashboard(const String& message) {
  tft.fillScreen(TFT_BLACK);
  tft.setTextSize(2);
  tft.setTextColor(TFT_GREEN, TFT_BLACK);
  tft.drawString("RFID WRITER", 10, 8);

  tft.setTextSize(1);
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.drawString(String("WiFi: ") + (WiFi.status() == WL_CONNECTED ? "OK" : "NO"), 10, 42);
  tft.drawString(String("Server: ") + (serverConnected ? "OK" : "NO"), 10, 62);
  tft.drawString(String("RFID: ") + (rfidReady ? "READY" : "NOT READY"), 10, 82);
  tft.drawString(String("Card: ") + (cardPresent ? "PRESENT" : "WAITING"), 10, 102);
  tft.drawString(String("UID: ") + (lastCardUid.length() ? lastCardUid : "-"), 10, 122);
  tft.drawString(String("Job: ") + (currentJobId.length() ? currentJobId : "-"), 10, 142);
  tft.drawString(String("Order: ") + (currentOrderNumber.length() ? currentOrderNumber : "-"), 10, 162);

  tft.setTextColor(TFT_YELLOW, TFT_BLACK);
  tft.drawString(message.substring(0, 38), 10, 200);
}

bool connectWifi() {
  drawDashboard("Connecting WiFi...");
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
  drawDashboard("Booting...");

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
    drawDashboard("Card detected.");

    if (currentJobId.length() > 0 && currentPayload.length() > 0) {
      drawDashboard("Writing card...");
      bool ok = writePayloadToCard(currentPayload);
      if (ok) {
        reportJobResult(true, "RFID card written successfully");
        drawDashboard("Write OK. Remove card.");
        currentJobId = "";
        currentOrderNumber = "";
        currentPayload = "";
      } else {
        reportJobResult(false, "RFID write failed. Check card type/auth/key.");
        drawDashboard("Write failed.");
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
