#include <TFT_eSPI.h>
#include "SCServo.h"

// =====================================================
// TEST 1-a: SERVO LOCATE  (find ZERO + MAX per servo)
// =====================================================
// Interactive helper. Servo positions on the bus are 0..4095 over 360
// deg, and after every power cycle the horns can sit anywhere. This
// tool lets you drive each servo to the two positions that matter and
// records them:
//
//   ZERO = the home / rest station of that servo
//   MAX  = the farthest it should ever be allowed to travel
//
// It captures 4 servos x 2 positions = 8 numbers. The 8 numbers are
// shown on the LCD and printed on the serial monitor, formatted so you
// can paste them straight into 1-b-servo-zero-porint.
//
// Controls (Wio Terminal buttons + 5-way joystick)
//   Button A            : select next servo (1 -> 2 -> 3 -> 4 -> 1)
//   Button B            : capture selected servo's position as ZERO
//   Button C            : capture selected servo's position as MAX
//   Joystick Up  / Down : jog + / - coarse (JOG_COARSE units)
//   Joystick Right/Left : jog + / - fine   (JOG_FINE units)
//   Joystick Press      : toggle mode
//                           JOG  = every servo holds, joystick jogs the
//                                  selected one
//                           HAND = every servo goes limp so you can pose
//                                  the horns by hand
// =====================================================

// ---------------- LCD ----------------
TFT_eSPI tft;

// ---------------- SERVO ----------------
#define SERVO_NUM 4
SMS_STS st;
byte ID[SERVO_NUM] = {1, 2, 3, 4};

// Jog step sizes in servo units (1024 units = 90 deg).
const s16 JOG_FINE   = 5;
const s16 JOG_COARSE = 50;
const u16 MOVE_SPEED = 2000;
const u8  MOVE_ACC   = 50;

// Captured results, -1 means "not captured yet".
s16 zeroPos[SERVO_NUM] = {-1, -1, -1, -1};
s16 maxPos [SERVO_NUM] = {-1, -1, -1, -1};

// Live jog target per servo (seeded from the servo's real position).
s16 target[SERVO_NUM]  = {2048, 2048, 2048, 2048};

int  sel      = 0;       // selected servo index (0..3)
bool handMode = false;   // false = JOG (torque on), true = HAND (limp)
bool redraw   = true;    // request a full screen redraw
int  posShown = -9999;   // last live position drawn (for partial update)
bool wasComplete = false;

// ---- input edge tracking ----
bool prevA = false, prevB = false, prevC = false, prevPress = false;
unsigned long lastJogMs = 0;
const unsigned long JOG_REPEAT_MS = 70;

// ---------------- HELPERS ----------------
int clampPos(int p) {
  if (p < 0)    return 0;
  if (p > 4095) return 4095;
  return p;
}

int readPosOr(byte id, int fallback) {
  int p = st.ReadPos(id);
  return (p >= 0) ? p : fallback;
}

bool allCaptured() {
  for (int i = 0; i < SERVO_NUM; i++) {
    if (zeroPos[i] < 0 || maxPos[i] < 0) return false;
  }
  return true;
}

// A servo that answers Ping/ReadPos but ignores WritePosEx is usually
// stuck in wheel/multi-turn mode or has a narrow angle limit. Only
// rewrites EEPROM when it is not already single-turn position mode with
// the full 0..4095 range (safe, same fix as servo-diagnose).
void ensurePositionMode(byte id) {
  int mode = st.ReadMode(id);
  int minA = st.readWord(id, SMS_STS_MIN_ANGLE_LIMIT_L);
  int maxA = st.readWord(id, SMS_STS_MAX_ANGLE_LIMIT_L);
  if (mode != 0 || minA != 0 || maxA != 4095) {
    st.unLockEprom(id);
    st.writeByte(id, SMS_STS_MODE, 0);
    st.writeWord(id, SMS_STS_MIN_ANGLE_LIMIT_L, 0);
    st.writeWord(id, SMS_STS_MAX_ANGLE_LIMIT_L, 4095);
    st.LockEprom(id);
    delay(80);
  }
}

// JOG: every servo holds its target. HAND: every servo goes limp so the
// horns can be posed by hand (their goal is refreshed to wherever the
// hand left them the moment torque comes back).
void setHandMode(bool on) {
  handMode = on;
  if (on) {
    for (int i = 0; i < SERVO_NUM; i++) st.EnableTorque(ID[i], 0);
  } else {
    for (int i = 0; i < SERVO_NUM; i++) {
      target[i] = readPosOr(ID[i], target[i]);
      st.WritePosEx(ID[i], target[i], MOVE_SPEED, MOVE_ACC);
      st.EnableTorque(ID[i], 1);
    }
  }
}

// ---------------- SERIAL OUTPUT ----------------
// Prints the 8 numbers, plus a copy-paste block for 1-b.
void printSummary() {
  Serial.println("[LOCATE] ===== 8 NUMBERS (ZERO / MAX per servo) =====");
  for (int i = 0; i < SERVO_NUM; i++) {
    Serial.print("[LOCATE] ID ");
    Serial.print(ID[i]);
    Serial.print("  ZERO=");
    Serial.print(zeroPos[i]);
    Serial.print("  MAX=");
    Serial.println(maxPos[i]);
  }
  Serial.print("[LOCATE] const s16 ZERO_POS[4] = {");
  for (int i = 0; i < SERVO_NUM; i++) {
    Serial.print(zeroPos[i]);
    if (i < SERVO_NUM - 1) Serial.print(", ");
  }
  Serial.println("};");
  Serial.print("[LOCATE] const s16 MAX_POS[4]  = {");
  for (int i = 0; i < SERVO_NUM; i++) {
    Serial.print(maxPos[i]);
    if (i < SERVO_NUM - 1) Serial.print(", ");
  }
  Serial.println("};");
  Serial.println("[LOCATE] =============================================");
}

// ---------------- DISPLAY ----------------
void drawStatic() {
  tft.fillScreen(TFT_BLACK);

  tft.setTextColor(TFT_GREEN, TFT_BLACK);
  tft.setTextSize(2);
  tft.setCursor(8, 4);
  tft.println("SERVO LOCATE");
  tft.drawFastHLine(0, 26, 320, TFT_DARKGREY);

  // Servo table: 8 captured numbers (Z + M for every servo).
  tft.setTextSize(2);
  int y = 32;
  for (int i = 0; i < SERVO_NUM; i++) {
    bool isSel = (i == sel);
    tft.setTextColor(isSel ? TFT_YELLOW : TFT_WHITE, TFT_BLACK);
    tft.setCursor(8, y);
    tft.print(isSel ? ">" : " ");
    tft.print(ID[i]);
    tft.print(" Z:");
    if (zeroPos[i] >= 0) tft.print(zeroPos[i]); else tft.print("----");
    tft.print(" M:");
    if (maxPos[i] >= 0) tft.print(maxPos[i]); else tft.print("----");
    y += 22;
  }

  tft.drawFastHLine(0, 122, 320, TFT_DARKGREY);

  // Mode + selected servo.
  tft.setCursor(8, 128);
  tft.setTextColor(handMode ? TFT_ORANGE : TFT_GREEN, TFT_BLACK);
  tft.print(handMode ? "HAND" : "JOG ");
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.print("  ID ");
  tft.print(ID[sel]);

  // Capture status.
  tft.setCursor(8, 176);
  if (allCaptured()) {
    tft.setTextColor(TFT_GREEN, TFT_BLACK);
    tft.print("ALL 8 SET -> serial");
  } else {
    int n = 0;
    for (int i = 0; i < SERVO_NUM; i++) {
      if (zeroPos[i] >= 0) n++;
      if (maxPos[i]  >= 0) n++;
    }
    tft.setTextColor(TFT_CYAN, TFT_BLACK);
    tft.print("Captured ");
    tft.print(n);
    tft.print("/8       ");
  }

  // Help.
  tft.setTextSize(1);
  tft.setTextColor(TFT_DARKGREY, TFT_BLACK);
  tft.setCursor(8, 200);
  tft.println("A:select  B:set ZERO  C:set MAX");
  tft.setCursor(8, 212);
  tft.println("Joy U/D coarse   L/R fine");
  tft.setCursor(8, 224);
  tft.println("Press: JOG <-> HAND (limp)");

  posShown = -9999;   // force the live line to repaint
}

// Updates only the live position number (called on every jog step).
void drawPos(int livePos) {
  tft.setTextSize(2);
  tft.setCursor(8, 150);
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.print("POS ");
  tft.print(livePos);
  tft.print("     ");   // trailing spaces clear stale digits
  posShown = livePos;
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
  pinMode(WIO_5S_UP, INPUT_PULLUP);
  pinMode(WIO_5S_DOWN, INPUT_PULLUP);
  pinMode(WIO_5S_LEFT, INPUT_PULLUP);
  pinMode(WIO_5S_RIGHT, INPUT_PULLUP);
  pinMode(WIO_5S_PRESS, INPUT_PULLUP);

  for (int i = 0; i < SERVO_NUM; i++) {
    if (st.Ping(ID[i]) != -1) {
      ensurePositionMode(ID[i]);
      target[i] = readPosOr(ID[i], 2048);
      st.WritePosEx(ID[i], target[i], MOVE_SPEED, MOVE_ACC);
      st.EnableTorque(ID[i], 1);
    } else {
      Serial.print("[LOCATE] WARNING: servo ID ");
      Serial.print(ID[i]);
      Serial.println(" not found on bus");
    }
  }

  Serial.println("[LOCATE] Servo locate tool ready");
  Serial.println("[LOCATE] A=select  B=set ZERO  C=set MAX");
  Serial.println("[LOCATE] Joy U/D=coarse  L/R=fine  Press=JOG/HAND");
}

// ---------------- LOOP ----------------
void loop() {
  int livePos = readPosOr(ID[sel], target[sel]);

  bool a     = digitalRead(WIO_KEY_A) == LOW;
  bool b     = digitalRead(WIO_KEY_B) == LOW;
  bool c     = digitalRead(WIO_KEY_C) == LOW;
  bool press = digitalRead(WIO_5S_PRESS) == LOW;

  // Button A: select next servo.
  if (a && !prevA) {
    sel = (sel + 1) % SERVO_NUM;
    target[sel] = readPosOr(ID[sel], target[sel]);
    redraw = true;
  }

  // Button B: capture ZERO.
  if (b && !prevB) {
    zeroPos[sel] = clampPos(livePos);
    Serial.print("[LOCATE] ID ");
    Serial.print(ID[sel]);
    Serial.print(" ZERO=");
    Serial.println(zeroPos[sel]);
    redraw = true;
  }

  // Button C: capture MAX.
  if (c && !prevC) {
    maxPos[sel] = clampPos(livePos);
    Serial.print("[LOCATE] ID ");
    Serial.print(ID[sel]);
    Serial.print(" MAX=");
    Serial.println(maxPos[sel]);
    redraw = true;
  }

  // Joystick press: toggle JOG / HAND.
  if (press && !prevPress) {
    setHandMode(!handMode);
    redraw = true;
  }

  prevA = a; prevB = b; prevC = c; prevPress = press;

  // Joystick jog (JOG mode only), rate-limited so a held direction
  // steps smoothly instead of racing.
  if (!handMode && (millis() - lastJogMs) > JOG_REPEAT_MS) {
    int delta = 0;
    if (digitalRead(WIO_5S_UP)    == LOW) delta += JOG_COARSE;
    if (digitalRead(WIO_5S_DOWN)  == LOW) delta -= JOG_COARSE;
    if (digitalRead(WIO_5S_RIGHT) == LOW) delta += JOG_FINE;
    if (digitalRead(WIO_5S_LEFT)  == LOW) delta -= JOG_FINE;
    if (delta != 0) {
      target[sel] = clampPos(target[sel] + delta);
      st.WritePosEx(ID[sel], target[sel], MOVE_SPEED, MOVE_ACC);
      lastJogMs = millis();
    }
  }

  // Auto-print the 8 numbers once, the moment the last one is captured.
  if (allCaptured() && !wasComplete) {
    printSummary();
  }
  wasComplete = allCaptured();

  // Draw.
  if (redraw) {
    drawStatic();
    drawPos(livePos);
    redraw = false;
  } else if (livePos != posShown) {
    drawPos(livePos);
  }

  delay(15);
}
