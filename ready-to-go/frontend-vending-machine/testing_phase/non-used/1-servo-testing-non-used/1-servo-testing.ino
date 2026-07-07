#include <TFT_eSPI.h>
#include "SCServo.h"

// =====================================================
// TEST 1: SERVO TESTING
// =====================================================
// Upload to the Wio Terminal to exercise the serial servo bus.
// It repeats 4 phases, each phase moves +90 deg and back (~2s):
//   Phase 1: servo 1
//   Phase 2: servos 1,2
//   Phase 3: servos 1,2,3
//   Phase 4: servos 1,2,3,4
// The current phase is shown on the Wio Terminal LCD.
// =====================================================

// ---------------- LCD ----------------
TFT_eSPI tft;

// ---------------- SERVO ----------------
#define SERVO_NUM 4
SMS_STS st;
byte ID[SERVO_NUM] = {1, 2, 3, 4};

// Serial servo units are 0-4095 over 360 deg, so 90 deg = 1024 units.
// POS_HOME is the resting/center position; POS_90 is +90 deg from home.
// Adjust these if your servo has different angle limits.
const s16 POS_HOME   = 2048;
const s16 POS_90     = 3072;  // POS_HOME + 1024
const u16 MOVE_SPEED = 2000;
const u8  MOVE_ACC   = 50;

// ---------------- DISPLAY ----------------
void displayPhase(int phase, const char* servosLabel) {
  tft.fillScreen(TFT_BLACK);

  tft.setTextColor(TFT_GREEN, TFT_BLACK);
  tft.setTextSize(3);
  tft.setCursor(20, 25);
  tft.println("SERVO TEST");

  tft.drawFastHLine(0, 70, 320, TFT_DARKGREY);

  tft.setTextSize(2);
  tft.setTextColor(TFT_CYAN, TFT_BLACK);
  tft.setCursor(20, 95);
  tft.print("Phase ");
  tft.print(phase);
  tft.println("/4");

  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.setCursor(20, 135);
  tft.println(servosLabel);

  tft.setTextColor(TFT_YELLOW, TFT_BLACK);
  tft.setCursor(20, 175);
  tft.println("90 deg + back");
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

// Move servos 1..count to +90 deg, hold, then back home. ~2 seconds total.
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
  delay(1000);

  Serial.println("[TEST] Servo test start");
}

// ---------------- LOOP ----------------
void loop() {
  runPhase(1, 1, "Servo 1");
  runPhase(2, 2, "Servos 1-2");
  runPhase(3, 3, "Servos 1-2-3");
  runPhase(4, 4, "Servos 1-2-3-4");

  Serial.println("[TEST] Cycle complete");

  homeAllServos();
  delay(1500);
}
