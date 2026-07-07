#include <TFT_eSPI.h>
#include "SCServo.h"

// =====================================================
// TEST 1-b: SERVO ZERO POINT  (home + test max travel)
// =====================================================
// Consumes the 8 numbers produced by 1-a-servo-locate. On boot it drives
// every servo to its ZERO (home) station. From there you can:
//   - send them all to MAX and back,
//   - run a per-servo sweep that measures how far each one actually
//     travels between ZERO and MAX and flags any that do not move.
//
// >>> PASTE THE 8 NUMBERS FROM 1-a-servo-locate BELOW <<<
// (order is servo ID 1, 2, 3, 4)
// Captured 2026-07-04 with 1-a-servo-locate. Note every MAX is below its
// ZERO: these servos open in the decreasing-count direction (~180 deg of
// travel). WritePosEx uses absolute targets, so the direction is fine.
const s16 ZERO_POS[4] = {2490, 2598, 2897, 3651};
const s16 MAX_POS[4]  = {250, 262, 905, 1552};
//
// Controls (Wio Terminal buttons + 5-way joystick)
//   Button A       : move ALL servos to ZERO (home)
//   Button B       : move ALL servos to MAX
//   Button C       : run one sweep test (ZERO->MAX->ZERO per servo)
//   Joystick Press : toggle continuous auto-sweep on / off
// =====================================================

// ---------------- LCD ----------------
TFT_eSPI tft;

// ---------------- SERVO ----------------
#define SERVO_NUM 4
SMS_STS st;
byte ID[SERVO_NUM] = {1, 2, 3, 4};

const u16 MOVE_SPEED = 2000;
const u8  MOVE_ACC   = 50;
const int SETTLE_TIMEOUT = 3000;  // ms max wait for a move to finish
const int MIN_TRAVEL     = 100;   // min units of motion to count as "moved"

// ---------------- STATE ----------------
int  curPos[SERVO_NUM] = {0, 0, 0, 0};
int  travel[SERVO_NUM] = {0, 0, 0, 0};
bool present[SERVO_NUM] = {false, false, false, false};
bool tested[SERVO_NUM]  = {false, false, false, false};
bool moved[SERVO_NUM]   = {false, false, false, false};
bool autoSweep = false;
const char* action = "BOOT";

bool prevA = false, prevB = false, prevC = false, prevPress = false;

// ---------------- HELPERS ----------------
void refreshPositions() {
  for (int i = 0; i < SERVO_NUM; i++) {
    if (present[i]) curPos[i] = st.ReadPos(ID[i]);
  }
}

// Poll until the servo stops moving (or we hit SETTLE_TIMEOUT). Robust
// for the large travels this mechanism uses, instead of guessing a fixed
// delay that would be too short for a ~180 deg move.
void settle(byte id) {
  int last = st.ReadPos(id);
  unsigned long start = millis();
  while (millis() - start < (unsigned long)SETTLE_TIMEOUT) {
    delay(100);
    int now = st.ReadPos(id);
    if (now < 0) continue;
    if (abs(now - last) < 8) break;   // stopped changing -> arrived / stalled
    last = now;
  }
}

void moveAll(const s16 pos[], const char* label) {
  action = label;
  Serial.print("[ZERO] move ALL -> ");
  Serial.println(label);
  for (int i = 0; i < SERVO_NUM; i++) {
    if (present[i]) st.WritePosEx(ID[i], pos[i], MOVE_SPEED, MOVE_ACC);
  }
  for (int i = 0; i < SERVO_NUM; i++) {
    if (present[i]) settle(ID[i]);   // they move together; this waits out the slowest
  }
  refreshPositions();
}

// Drive one servo ZERO->MAX->ZERO and measure how far it really goes.
void sweepServo(int i) {
  if (!present[i]) return;

  int expected = abs((int)MAX_POS[i] - (int)ZERO_POS[i]);

  st.WritePosEx(ID[i], ZERO_POS[i], MOVE_SPEED, MOVE_ACC);
  settle(ID[i]);
  int atZero = st.ReadPos(ID[i]);

  st.WritePosEx(ID[i], MAX_POS[i], MOVE_SPEED, MOVE_ACC);
  settle(ID[i]);
  int atMax = st.ReadPos(ID[i]);

  st.WritePosEx(ID[i], ZERO_POS[i], MOVE_SPEED, MOVE_ACC);
  settle(ID[i]);
  int back = st.ReadPos(ID[i]);

  travel[i] = abs(atMax - atZero);
  curPos[i] = back;
  tested[i] = true;
  // "moved" if it covered at least half the intended span (and a floor).
  int threshold = expected / 2;
  if (threshold < MIN_TRAVEL) threshold = MIN_TRAVEL;
  moved[i] = travel[i] >= threshold;

  Serial.print("[ZERO] ID ");
  Serial.print(ID[i]);
  Serial.print(" zero=");
  Serial.print(ZERO_POS[i]);
  Serial.print(" max=");
  Serial.print(MAX_POS[i]);
  Serial.print(" expected=");
  Serial.print(expected);
  Serial.print(" travel=");
  Serial.print(travel[i]);
  Serial.println(moved[i] ? "  MOVED" : "  NO MOVE");
}

void runSweep() {
  action = "SWEEP";
  Serial.println("[ZERO] ---- sweep test (ZERO->MAX->ZERO) ----");
  for (int i = 0; i < SERVO_NUM; i++) sweepServo(i);
  Serial.println("[ZERO] ---- sweep done ----");
}

// ---------------- DISPLAY ----------------
void draw() {
  tft.fillScreen(TFT_BLACK);

  tft.setTextColor(TFT_GREEN, TFT_BLACK);
  tft.setTextSize(2);
  tft.setCursor(8, 4);
  tft.println("SERVO ZERO+MAX");
  tft.drawFastHLine(0, 26, 320, TFT_DARKGREY);

  // Column header.
  tft.setTextSize(2);
  tft.setTextColor(TFT_DARKGREY, TFT_BLACK);
  tft.setCursor(8, 32);   tft.print("ID");
  tft.setCursor(44, 32);  tft.print("ZERO");
  tft.setCursor(132, 32); tft.print("MAX");
  tft.setCursor(220, 32); tft.print("POS");

  int y = 58;
  for (int i = 0; i < SERVO_NUM; i++) {
    uint16_t color = TFT_WHITE;
    if (!present[i])     color = TFT_DARKGREY;
    else if (tested[i])  color = moved[i] ? TFT_GREEN : TFT_RED;

    tft.setTextColor(color, TFT_BLACK);
    tft.setCursor(8, y);   tft.print(ID[i]);
    tft.setCursor(44, y);  tft.print(ZERO_POS[i]);
    tft.setCursor(132, y); tft.print(MAX_POS[i]);
    tft.setCursor(220, y);
    if (present[i]) tft.print(curPos[i]); else tft.print("--");
    y += 24;
  }

  tft.drawFastHLine(0, 156, 320, TFT_DARKGREY);

  tft.setTextSize(2);
  tft.setTextColor(TFT_CYAN, TFT_BLACK);
  tft.setCursor(8, 164);
  tft.print("ACT:");
  tft.print(action);
  tft.setTextColor(autoSweep ? TFT_GREEN : TFT_DARKGREY, TFT_BLACK);
  tft.setCursor(200, 164);
  tft.print(autoSweep ? "AUTO ON" : "AUTO OFF");

  tft.setTextSize(1);
  tft.setTextColor(TFT_DARKGREY, TFT_BLACK);
  tft.setCursor(8, 200);
  tft.println("A:home ZERO   B:go MAX   C:sweep once");
  tft.setCursor(8, 214);
  tft.println("Press: auto-sweep on/off");
  tft.setCursor(8, 228);
  tft.println("green=moved  red=NO MOVE  grey=absent");
}

// ---------------- SETUP ----------------
void setup() {
  Serial.begin(115200);

  tft.init();
  tft.setRotation(3);
  tft.fillScreen(TFT_BLACK);

  Serial1.begin(1000000);
  st.pSerial = &Serial1;
  delay(300);

  pinMode(WIO_KEY_A, INPUT_PULLUP);
  pinMode(WIO_KEY_B, INPUT_PULLUP);
  pinMode(WIO_KEY_C, INPUT_PULLUP);
  pinMode(WIO_5S_PRESS, INPUT_PULLUP);

  Serial.println("[ZERO] Servo zero-point tool ready");
  for (int i = 0; i < SERVO_NUM; i++) {
    present[i] = (st.Ping(ID[i]) != -1);
    if (present[i]) {
      st.EnableTorque(ID[i], 1);
    } else {
      Serial.print("[ZERO] WARNING: servo ID ");
      Serial.print(ID[i]);
      Serial.println(" not found on bus");
    }
  }

  moveAll(ZERO_POS, "HOME");
  draw();
}

// ---------------- LOOP ----------------
void loop() {
  bool a     = digitalRead(WIO_KEY_A) == LOW;
  bool b     = digitalRead(WIO_KEY_B) == LOW;
  bool c     = digitalRead(WIO_KEY_C) == LOW;
  bool press = digitalRead(WIO_5S_PRESS) == LOW;

  if (a && !prevA) {
    moveAll(ZERO_POS, "HOME");
    draw();
  }
  if (b && !prevB) {
    moveAll(MAX_POS, "MAX");
    draw();
  }
  if (c && !prevC) {
    runSweep();
    draw();
  }
  if (press && !prevPress) {
    autoSweep = !autoSweep;
    draw();
  }

  prevA = a; prevB = b; prevC = c; prevPress = press;

  if (autoSweep) {
    runSweep();
    draw();
    delay(500);
  }

  delay(40);
}
