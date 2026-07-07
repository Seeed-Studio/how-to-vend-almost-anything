#include <TFT_eSPI.h>
#include "SCServo.h"

// =====================================================
// SERVO SET ID (diagnostic / setup utility)
// =====================================================
// Assigns a unique ID to a serial bus servo. Connect ONE servo at a
// time, pick the target ID with button A, then press button C to write
// it. Repeat for each servo so they end up as IDs 1, 2, 3, 4.
//
//   Button A (top-left)  : cycle target ID  1 -> 2 -> 3 -> 4 -> 1
//   Button C (top-right) : program the connected servo to target ID
//
// After a successful write the servo wiggles a little so you can see
// which one was just programmed.
// =====================================================

TFT_eSPI tft;
SMS_STS st;

int targetId = 1;
int connectedId = -1;

const u16 WIGGLE_SPEED = 1500;
const u8  WIGGLE_ACC   = 50;

void draw(const char* status, uint16_t statusColor) {
  tft.fillScreen(TFT_BLACK);

  tft.setTextColor(TFT_GREEN, TFT_BLACK);
  tft.setTextSize(2);
  tft.setCursor(10, 8);
  tft.println("SERVO SET ID");
  tft.drawFastHLine(0, 34, 320, TFT_DARKGREY);

  tft.setTextSize(2);
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.setCursor(10, 46);
  tft.print("Connected ID: ");
  if (connectedId >= 0) {
    tft.println(connectedId);
  } else {
    tft.println("none");
  }

  tft.setTextColor(TFT_CYAN, TFT_BLACK);
  tft.setCursor(10, 74);
  tft.print("Target ID:    ");
  tft.println(targetId);

  tft.setTextColor(TFT_YELLOW, TFT_BLACK);
  tft.setTextSize(1);
  tft.setCursor(10, 110);
  tft.println("A = change target ID (1-4)");
  tft.setCursor(10, 126);
  tft.println("C = program connected servo");
  tft.setCursor(10, 142);
  tft.println("Connect only ONE servo at a time.");

  tft.setTextSize(2);
  tft.setTextColor(statusColor, TFT_BLACK);
  tft.setCursor(10, 178);
  tft.println(status);
}

// Returns the ID of the single connected servo, or -1 if none / unclear.
int detectConnectedId() {
  return st.Ping(0xFE);
}

void wiggle(int id) {
  int pos = st.ReadPos(id);
  if (pos < 0) return;

  s16 a = (s16)pos + 150;
  s16 b = (s16)pos;
  if (a > 4095) a = 4095;

  st.WritePosEx(id, a, WIGGLE_SPEED, WIGGLE_ACC);
  delay(400);
  st.WritePosEx(id, b, WIGGLE_SPEED, WIGGLE_ACC);
  delay(400);
}

bool programId(int oldId, int newId) {
  if (oldId < 0) return false;

  Serial.print("[SETID] Writing ID ");
  Serial.print(oldId);
  Serial.print(" -> ");
  Serial.println(newId);

  st.unLockEprom(oldId);
  st.writeByte(oldId, SMS_STS_ID, (u8)newId);
  st.LockEprom(newId);
  delay(100);

  int check = st.Ping(newId);
  Serial.print("[SETID] Verify ping of new ID returned: ");
  Serial.println(check);

  return check == newId;
}

void setup() {
  Serial.begin(115200);

  tft.init();
  tft.setRotation(3);
  tft.fillScreen(TFT_BLACK);

  Serial1.begin(1000000);
  st.pSerial = &Serial1;
  delay(300);

  pinMode(WIO_KEY_A, INPUT_PULLUP);
  pinMode(WIO_KEY_C, INPUT_PULLUP);

  Serial.println("[SETID] Servo set-ID utility ready");
  connectedId = detectConnectedId();
  draw("Ready", TFT_WHITE);
}

void loop() {
  int now = detectConnectedId();
  if (now != connectedId) {
    connectedId = now;
    draw("Ready", TFT_WHITE);
  }

  if (digitalRead(WIO_KEY_A) == LOW) {
    targetId++;
    if (targetId > 4) targetId = 1;
    draw("Target changed", TFT_CYAN);
    delay(300);
  }

  if (digitalRead(WIO_KEY_C) == LOW) {
    connectedId = detectConnectedId();

    if (connectedId < 0) {
      Serial.println("[SETID] No single servo detected on bus");
      draw("No servo found!", TFT_RED);
      delay(900);
      return;
    }

    bool ok = programId(connectedId, targetId);

    if (ok) {
      connectedId = targetId;
      Serial.println("[SETID] Success");
      draw("Done - ID set!", TFT_GREEN);
      wiggle(targetId);
    } else {
      Serial.println("[SETID] Failed to set ID");
      draw("Set FAILED", TFT_RED);
    }

    delay(900);
  }

  delay(50);
}
