#include <Wire.h>
#include <TFT_eSPI.h>
#include "Emakefun_RFID.h"

// =====================================================
// CARD WRITER (helper for test 2 / test 3)
// =====================================================
// Writes the "certain data" test payload to a MIFARE Classic 1K card so that
// test 2 / test 3 will recognize it and run the servos.
//
// It writes this JSON across MIFARE blocks 4,5,6,8,9,10 with the default key
// FF FF FF FF FF FF (never touching trailer blocks 7/11):
//   {"user_name":"Alice","order_number":"ORD-TEST-0001","v":1}
//
// Usage:
//   1. Upload this sketch.
//   2. When the screen says "Tap card to WRITE", hold a blank MIFARE Classic
//      1K card on the reader until it shows "WRITTEN OK".
//   3. Re-upload 2-servo-rfid-testing and tap the same card -> servos move.
//
// The reader is on the Wire1 bus (Grove I2C on the Wio Terminal); see the
// "#define Wire Wire1" note in Emakefun_RFID.cpp.
// =====================================================

// Must match TARGET_USER_NAME / TARGET_ORDER_NUMBER in the test sketch.
const char* CARD_USER_NAME    = "Alice";
const char* CARD_ORDER_NUMBER = "ORD-TEST-0001";

TFT_eSPI tft;

#define RFID_ADDR 0x28
MFRC522 mfrc522(RFID_ADDR);
MFRC522::MIFARE_Key rfidKey;
bool rfidReady = false;

// Must match the test sketch. Do not use trailer blocks 7 or 11.
const byte DATA_BLOCKS[] = {4, 5, 6, 8, 9, 10};
const int DATA_BLOCK_COUNT = sizeof(DATA_BLOCKS) / sizeof(DATA_BLOCKS[0]);
const int MAX_PAYLOAD_LEN = DATA_BLOCK_COUNT * 16;  // 96 bytes

String buildPayload() {
  return String("{\"user_name\":\"") + CARD_USER_NAME +
         "\",\"order_number\":\"" + CARD_ORDER_NUMBER + "\",\"v\":1}";
}

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
  tft.setCursor(20, 25);
  tft.println(title);

  tft.drawFastHLine(0, 65, 320, TFT_DARKGREY);

  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.setCursor(20, 90);
  tft.println(line1);
  tft.setCursor(20, 130);
  tft.println(line2);
  tft.setCursor(20, 170);
  tft.println(line3);
}

void showWaiting() {
  if (!rfidReady) {
    displayScreen("CARD WRITER", "RFID not ready", "Press A to init RFID", "", TFT_YELLOW);
  } else {
    displayScreen("CARD WRITER", "Tap card to WRITE:", CARD_USER_NAME, CARD_ORDER_NUMBER, TFT_CYAN);
  }
}

bool authenticateBlock(byte blockAddr) {
  byte status = mfrc522.PCD_Authenticate(
    MFRC522::PICC_CMD_MF_AUTH_KEY_A, blockAddr, &rfidKey, &(mfrc522.uid));
  if (status != MFRC522::STATUS_OK) {
    Serial.print("[WRITE] Auth failed block ");
    Serial.print(blockAddr);
    Serial.print(": ");
    Serial.println(mfrc522.GetStatusCodeName(status));
    return false;
  }
  return true;
}

bool writePayloadToCard(const String& payload) {
  if (payload.length() > MAX_PAYLOAD_LEN) {
    Serial.println("[WRITE] Payload too long");
    return false;
  }

  for (int i = 0; i < DATA_BLOCK_COUNT; i++) {
    byte buffer[16];
    memset(buffer, 0, 16);

    int start = i * 16;
    for (int j = 0; j < 16; j++) {
      int idx = start + j;
      if (idx < (int)payload.length()) buffer[j] = payload[idx];
    }

    byte block = DATA_BLOCKS[i];
    if (!authenticateBlock(block)) return false;

    byte status = mfrc522.MIFARE_Write(block, buffer, 16);
    if (status != MFRC522::STATUS_OK) {
      Serial.print("[WRITE] Write failed block ");
      Serial.print(block);
      Serial.print(": ");
      Serial.println(mfrc522.GetStatusCodeName(status));
      return false;
    }
  }
  return true;
}

void initRFID() {
  displayScreen("CARD WRITER", "Starting RFID...", "", "", TFT_CYAN);

  // Grove I2C is on Wire1 (SERCOM4) on the Wio Terminal.
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

void setup() {
  Serial.begin(115200);

  tft.init();
  tft.setRotation(3);
  tft.fillScreen(TFT_BLACK);

  pinMode(WIO_KEY_A, INPUT_PULLUP);

  for (byte i = 0; i < 6; i++) rfidKey.keyByte[i] = 0xFF;

  Serial.println("[WRITER] Card writer start");
  Serial.print("[WRITER] Will write: ");
  Serial.println(buildPayload());

  initRFID();
}

void loop() {
  if (!rfidReady) {
    if (digitalRead(WIO_KEY_A) == LOW) {
      initRFID();
      delay(500);
    }
    return;
  }

  if (!mfrc522.PICC_IsNewCardPresent()) return;
  if (!mfrc522.PICC_ReadCardSerial()) return;

  String payload = buildPayload();
  Serial.print("[WRITE] Writing payload: ");
  Serial.println(payload);

  displayScreen("WRITING...", "Hold card still", CARD_USER_NAME, CARD_ORDER_NUMBER, TFT_YELLOW);

  bool ok = writePayloadToCard(payload);

  mfrc522.PICC_HaltA();
  mfrc522.PCD_StopCrypto1();

  if (ok) {
    Serial.println("[WRITE] Success");
    displayScreen("WRITTEN OK", "Now load test 2", "and tap this card", "", TFT_GREEN);
  } else {
    Serial.println("[WRITE] Failed - check card type (MIFARE Classic 1K)");
    displayScreen("WRITE FAILED", "Use MIFARE Classic", "1K card, tap again", "", TFT_RED);
  }

  delay(2500);
  showWaiting();
}
