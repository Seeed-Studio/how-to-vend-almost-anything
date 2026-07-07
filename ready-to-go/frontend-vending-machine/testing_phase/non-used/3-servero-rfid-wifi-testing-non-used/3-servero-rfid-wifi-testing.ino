#include <Wire.h>
#include <TFT_eSPI.h>
#include "Emakefun_RFID.h"
#include "SCServo.h"
#include <rpcWiFi.h>
#include <HTTPClient.h>

// =====================================================
// TEST 3: SERVO + RFID + WIFI TESTING
// =====================================================
// Same as test 2 (RFID card triggers the 4-phase servo sequence), but
// on a matching card it also connects to WiFi and sends an HTTP POST
// with the body "hello world" to http://192.168.120.124/.
//
// Card payload format (from backend-full/wio-rfid-writer):
//   {"user_name":"...","order_number":"ORD-...","v":1}
// stored across MIFARE blocks 4,5,6,8,9,10 using key FF FF FF FF FF FF.
// =====================================================

// ---------------- WIFI / MESSAGE ----------------
const char* WIFI_SSID     = "SEEED-CSG-5G";
const char* WIFI_PASSWORD = "So3C90a#cp32";

// Where to send the message, and the message body itself.
const char* MESSAGE_URL  = "http://192.168.120.124/";
const char* MESSAGE_BODY = "hello world";

bool wifiReady = false;

// ---------------- CERTAIN DATA (trigger target) ----------------
// The card must contain this user_name + order_number to trigger the
// servos and the "hello world" message.
const char* TARGET_USER_NAME    = "Alice";
const char* TARGET_ORDER_NUMBER = "ORD-TEST-0001";

// ---------------- LCD ----------------
TFT_eSPI tft;

// ---------------- RFID ----------------
#define RFID_ADDR 0x28
MFRC522 mfrc522(RFID_ADDR);
MFRC522::MIFARE_Key rfidKey;
bool rfidReady = false;

// Must match backend-full/wio-rfid-writer. Do not use trailer blocks 7 or 11.
const byte DATA_BLOCKS[] = {4, 5, 6, 8, 9, 10};
const int DATA_BLOCK_COUNT = sizeof(DATA_BLOCKS) / sizeof(DATA_BLOCKS[0]);

// ---------------- SERVO ----------------
#define SERVO_NUM 4
SMS_STS st;
byte ID[SERVO_NUM] = {1, 2, 3, 4};

// Serial servo units are 0-4095 over 360 deg, so 90 deg = 1024 units.
const s16 POS_HOME   = 2048;
const s16 POS_90     = 3072;  // POS_HOME + 1024
const u16 MOVE_SPEED = 2000;
const u8  MOVE_ACC   = 50;

// ---------------- DISPLAY ----------------
void displayScreen(
  const char* title,
  const char* line1,
  const char* line2,
  const char* line3,
  uint16_t color
) {
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(color, TFT_BLACK);
  tft.setTextSize(2);
  tft.setCursor(20, 30);
  tft.println(title);

  tft.drawFastHLine(0, 70, 320, TFT_DARKGREY);

  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.setCursor(20, 100);
  tft.println(line1);

  tft.setCursor(20, 140);
  tft.println(line2);

  tft.setCursor(20, 180);
  tft.println(line3);
}

void showWaiting() {
  if (!rfidReady) {
    displayScreen("SERVO+RFID+WIFI", "RFID not ready", "Press A to init RFID", "", TFT_YELLOW);
  } else {
    char wifiLine[24];
    snprintf(wifiLine, sizeof(wifiLine), "WiFi: %s", wifiReady ? "OK" : "NO");
    displayScreen("SERVO+RFID+WIFI", "Scan the test card", wifiLine, "", TFT_CYAN);
  }
}

void displayPhase(int phase, const char* servosLabel) {
  tft.fillScreen(TFT_BLACK);

  tft.setTextColor(TFT_GREEN, TFT_BLACK);
  tft.setTextSize(3);
  tft.setCursor(20, 25);
  tft.println("SERVO MOVE");

  tft.drawFastHLine(0, 70, 320, TFT_DARKGREY);

  tft.setTextSize(2);
  tft.setTextColor(TFT_CYAN, TFT_BLACK);
  tft.setCursor(20, 100);
  tft.print("Phase ");
  tft.print(phase);
  tft.println("/4");

  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.setCursor(20, 140);
  tft.println(servosLabel);
}

// ---------------- SERVO HELPERS ----------------
void moveServo(byte id, s16 pos) {
  st.WritePosEx(id, pos, MOVE_SPEED, MOVE_ACC);
}

void homeAllServos() {
  for (int i = 0; i < SERVO_NUM; i++) {
    moveServo(ID[i], POS_HOME);
  }
}

void runPhase(int phase, int count, const char* servosLabel) {
  Serial.print("[PHASE ");
  Serial.print(phase);
  Serial.print("/4] ");
  Serial.print(servosLabel);
  Serial.println(" -> 90 -> home");

  displayPhase(phase, servosLabel);

  for (int i = 0; i < count; i++) {
    moveServo(ID[i], POS_90);
  }
  delay(1000);

  for (int i = 0; i < count; i++) {
    moveServo(ID[i], POS_HOME);
  }
  delay(1000);
}

void runServoSequence() {
  runPhase(1, 1, "Servo 1");
  runPhase(2, 2, "Servos 1-2");
  runPhase(3, 3, "Servos 1-2-3");
  runPhase(4, 4, "Servos 1-2-3-4");
  homeAllServos();
}

// ---------------- JSON ----------------
String jsonValue(const String& json, const String& key) {
  String needle = "\"" + key + "\":";
  int p = json.indexOf(needle);
  if (p < 0) return "";

  p += needle.length();

  while (p < json.length() && (json[p] == ' ' || json[p] == '\t')) {
    p++;
  }

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

// ---------------- WIFI / HTTP ----------------
void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    wifiReady = true;
    return;
  }

  displayScreen("Connecting WiFi", WIFI_SSID, "Please wait...", "", TFT_CYAN);

  Serial.print("[WIFI] Connecting to: ");
  Serial.println(WIFI_SSID);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;

  while (WiFi.status() != WL_CONNECTED && attempts < 40) {
    delay(500);
    Serial.print("[WIFI] Attempt ");
    Serial.print(attempts + 1);
    Serial.print(" status=");
    Serial.println(WiFi.status());
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    wifiReady = true;
    Serial.println("[WIFI] Connected");
    Serial.print("[WIFI] IP: ");
    Serial.println(WiFi.localIP());
  } else {
    wifiReady = false;
    Serial.println("[WIFI] Failed to connect");
    Serial.print("[WIFI] Final status=");
    Serial.println(WiFi.status());
  }
}

bool ensureWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    wifiReady = true;
    return true;
  }

  connectWiFi();
  return WiFi.status() == WL_CONNECTED;
}

// Sends the "hello world" message. Returns the HTTP status code, or a
// negative value on connection/transport failure.
int sendHelloWorld() {
  if (!ensureWiFi()) {
    Serial.println("[HTTP] No WiFi, cannot send message");
    return -1;
  }

  HTTPClient http;

  Serial.print("[HTTP] POST ");
  Serial.println(MESSAGE_URL);
  Serial.print("[HTTP] Body: ");
  Serial.println(MESSAGE_BODY);

  http.begin(MESSAGE_URL);
  http.setTimeout(8000);
  http.addHeader("Content-Type", "text/plain");

  int httpCode = http.POST(String(MESSAGE_BODY));

  String response = "";
  if (httpCode > 0) {
    response = http.getString();
  }

  http.end();

  Serial.print("[HTTP] Code: ");
  Serial.println(httpCode);
  Serial.print("[HTTP] Response: ");
  Serial.println(response);

  return httpCode;
}

// ---------------- RFID ----------------
void stopRFID() {
  mfrc522.PICC_HaltA();
  mfrc522.PCD_StopCrypto1();
}

String getScannedUIDString() {
  String uidText = "";

  for (byte i = 0; i < mfrc522.uid.size; i++) {
    if (mfrc522.uid.uidByte[i] < 0x10) {
      uidText += "0";
    }

    uidText += String(mfrc522.uid.uidByte[i], HEX);

    if (i < mfrc522.uid.size - 1) {
      uidText += " ";
    }
  }

  uidText.toUpperCase();
  return uidText;
}

bool authenticateBlock(byte blockAddr) {
  MFRC522::StatusCode status;
  status = (MFRC522::StatusCode)mfrc522.PCD_Authenticate(
    MFRC522::PICC_CMD_MF_AUTH_KEY_A,
    blockAddr,
    &rfidKey,
    &(mfrc522.uid)
  );

  if (status != MFRC522::STATUS_OK) {
    Serial.print("[RFID] Auth failed block ");
    Serial.print(blockAddr);
    Serial.print(": ");
    Serial.println(mfrc522.GetStatusCodeName(status));
    return false;
  }

  return true;
}

bool readPayloadFromCard(String &payload) {
  payload = "";

  for (int b = 0; b < DATA_BLOCK_COUNT; b++) {
    byte blockAddr = DATA_BLOCKS[b];

    if (!authenticateBlock(blockAddr)) {
      return false;
    }

    byte buffer[18];
    byte size = sizeof(buffer);
    MFRC522::StatusCode status = (MFRC522::StatusCode)mfrc522.MIFARE_Read(blockAddr, buffer, &size);

    if (status != MFRC522::STATUS_OK) {
      Serial.print("[RFID] Read failed block ");
      Serial.print(blockAddr);
      Serial.print(": ");
      Serial.println(mfrc522.GetStatusCodeName(status));
      return false;
    }

    for (int i = 0; i < 16; i++) {
      if (buffer[i] == 0) {
        continue;
      }
      payload += (char)buffer[i];
    }
  }

  payload.trim();

  Serial.print("[RFID] Payload from card: ");
  Serial.println(payload);

  return payload.length() > 0;
}

void initRFID() {
  displayScreen("SERVO+RFID+WIFI", "Starting RFID...", "", "", TFT_CYAN);

  // On the Wio Terminal the Grove I2C port is on the Wire1 bus (SERCOM4),
  // shared with the onboard accelerometer. An I2C scan confirmed the reader
  // answers at 0x28 on Wire1. Emakefun_RFID.cpp is mapped to Wire1 to match
  // (see the "#define Wire Wire1" note at the top of that file).
  Wire1.begin();
  mfrc522.PCD_Init();

  byte v = mfrc522.PCD_ReadRegister(mfrc522.VersionReg);

  Serial.print("[RFID] Version register: 0x");
  if (v < 0x10) Serial.print("0");
  Serial.println(v, HEX);

  if (v == 0x00 || v == 0xFF) {
    Serial.println("[RFID] Reader not responding");
    rfidReady = false;
  } else {
    Serial.println("[RFID] Reader detected and ready");
    mfrc522.PCD_AntennaOn();
    rfidReady = true;
  }

  showWaiting();
}

// ---------------- MAIN RFID SCAN ----------------
void scanCard() {
  if (!rfidReady) return;

  if (!mfrc522.PICC_IsNewCardPresent()) return;
  if (!mfrc522.PICC_ReadCardSerial()) return;

  String uid = getScannedUIDString();
  Serial.print("[RFID] Scanned UID: ");
  Serial.println(uid);

  displayScreen("CARD DETECTED", uid.c_str(), "Reading card...", "", TFT_CYAN);

  String payload = "";
  bool readOk = readPayloadFromCard(payload);

  stopRFID();
  delay(300);

  if (!readOk || payload.length() == 0) {
    Serial.println("[RFID] No valid payload found on card");
    displayScreen("CARD ERROR", "No payload on card", "Try another card", "", TFT_RED);
    delay(1500);
    showWaiting();
    return;
  }

  String userName = jsonValue(payload, "user_name");
  String orderNumber = jsonValue(payload, "order_number");

  Serial.print("[RFID] user_name: ");
  Serial.println(userName);
  Serial.print("[RFID] order_number: ");
  Serial.println(orderNumber);

  bool matched = (userName == TARGET_USER_NAME) && (orderNumber == TARGET_ORDER_NUMBER);

  if (!matched) {
    Serial.println("[RFID] Payload does not match certain data target");
    displayScreen("UNKNOWN CARD", "Data does not match", "target in sketch", "", TFT_RED);
    delay(1500);
    showWaiting();
    return;
  }

  Serial.println("[MATCH] Certain data matched.");
  displayScreen("CARD MATCHED", userName.c_str(), orderNumber.c_str(), "Sending message...", TFT_GREEN);

  int httpCode = sendHelloWorld();

  char codeLine[24];
  if (httpCode > 0) {
    snprintf(codeLine, sizeof(codeLine), "POST %d", httpCode);
  } else {
    snprintf(codeLine, sizeof(codeLine), "POST failed (%d)", httpCode);
  }

  displayScreen(
    (httpCode >= 200 && httpCode < 400) ? "MESSAGE SENT" : "MESSAGE ERROR",
    "hello world",
    codeLine,
    "Moving servos...",
    (httpCode >= 200 && httpCode < 400) ? TFT_GREEN : TFT_YELLOW
  );
  delay(1200);

  runServoSequence();

  displayScreen("TEST DONE", "Msg + servo done", "Scan again to repeat", "", TFT_GREEN);
  delay(1500);
  showWaiting();
}

// ---------------- SETUP ----------------
void setup() {
  Serial.begin(115200);

  tft.init();
  tft.setRotation(3);
  tft.fillScreen(TFT_BLACK);

  Serial1.begin(1000000);
  st.pSerial = &Serial1;
  delay(200);
  homeAllServos();

  pinMode(WIO_KEY_A, INPUT_PULLUP);

  for (byte i = 0; i < 6; i++) {
    rfidKey.keyByte[i] = 0xFF;
  }

  Serial.println("[TEST] Servo + RFID + WiFi test start");
  Serial.print("[TEST] Target user_name: ");
  Serial.println(TARGET_USER_NAME);
  Serial.print("[TEST] Target order_number: ");
  Serial.println(TARGET_ORDER_NUMBER);

  connectWiFi();
  initRFID();
}

// ---------------- LOOP ----------------
void loop() {
  if (!rfidReady) {
    if (digitalRead(WIO_KEY_A) == LOW) {
      initRFID();
      delay(500);
    }
    return;
  }

  scanCard();
}
