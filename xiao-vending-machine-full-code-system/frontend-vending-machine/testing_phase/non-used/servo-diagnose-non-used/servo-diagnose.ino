#include <TFT_eSPI.h>
#include "SCServo.h"

// =====================================================
// SERVO DIAGNOSE + NORMALIZE (diagnostic / repair)
// =====================================================
// For each servo ID 1..4 this sketch:
//   1. Reads and prints its config: mode, torque, angle limits, pos.
//   2. If it is not in single-turn position mode (mode 0, min-angle 0,
//      max-angle 4095), it normalizes it: unlock EPROM -> set mode 0,
//      min 0, max 4095 -> lock EPROM -> enable torque.
//   3. Then continuously sweeps every servo 2048 <-> 3072 and reports
//      whether each one actually moved.
//
// Why: a servo that answers Ping/ReadPos but ignores WritePosEx is
// usually stuck in wheel/multi-turn mode or has a narrow angle limit.
// =====================================================

TFT_eSPI tft;
SMS_STS st;

#define SERVO_NUM 4
byte ID[SERVO_NUM] = {1, 2, 3, 4};

const s16 POS_A = 2048;   // sweep endpoints (match the servo test)
const s16 POS_B = 3072;
const u16 MOVE_SPEED = 2000;
const u8  MOVE_ACC   = 50;

bool moved[SERVO_NUM] = {false, false, false, false};
int  lastMode[SERVO_NUM] = {-1, -1, -1, -1};

void printConfig(const char* tag, byte id) {
  int mode   = st.ReadMode(id);
  int torque = st.readByte(id, SMS_STS_TORQUE_ENABLE);
  int minA   = st.readWord(id, SMS_STS_MIN_ANGLE_LIMIT_L);
  int maxA   = st.readWord(id, SMS_STS_MAX_ANGLE_LIMIT_L);
  int pos    = st.ReadPos(id);
  int volt   = st.ReadVoltage(id);

  Serial.print("[DIAG] ");
  Serial.print(tag);
  Serial.print(" ID ");
  Serial.print(id);
  Serial.print(" mode=");
  Serial.print(mode);
  Serial.print(" torque=");
  Serial.print(torque);
  Serial.print(" min=");
  Serial.print(minA);
  Serial.print(" max=");
  Serial.print(maxA);
  Serial.print(" pos=");
  Serial.print(pos);
  Serial.print(" V=");
  Serial.println(volt);
}

// Force single-turn position mode + full range + torque on.
void normalizeServo(byte id) {
  int mode = st.ReadMode(id);
  int minA = st.readWord(id, SMS_STS_MIN_ANGLE_LIMIT_L);
  int maxA = st.readWord(id, SMS_STS_MAX_ANGLE_LIMIT_L);

  bool needsWrite = (mode != 0) || (minA != 0) || (maxA != 4095);

  if (needsWrite) {
    Serial.print("[DIAG] Normalizing ID ");
    Serial.println(id);
    st.unLockEprom(id);
    st.writeByte(id, SMS_STS_MODE, 0);
    st.writeWord(id, SMS_STS_MIN_ANGLE_LIMIT_L, 0);
    st.writeWord(id, SMS_STS_MAX_ANGLE_LIMIT_L, 4095);
    st.LockEprom(id);
    delay(80);
  }

  st.EnableTorque(id, 1);
  delay(20);
}

void setup() {
  Serial.begin(115200);

  tft.init();
  tft.setRotation(3);
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_GREEN, TFT_BLACK);
  tft.setTextSize(2);
  tft.setCursor(10, 10);
  tft.println("SERVO DIAGNOSE");

  Serial1.begin(1000000);
  st.pSerial = &Serial1;
  delay(500);

  Serial.println("[DIAG] ===== BEFORE =====");
  for (int i = 0; i < SERVO_NUM; i++) {
    if (st.Ping(ID[i]) == -1) {
      Serial.print("[DIAG] ID ");
      Serial.print(ID[i]);
      Serial.println(" NOT FOUND");
      continue;
    }
    printConfig("BEFORE", ID[i]);
  }

  Serial.println("[DIAG] ===== NORMALIZE =====");
  for (int i = 0; i < SERVO_NUM; i++) {
    if (st.Ping(ID[i]) != -1) {
      normalizeServo(ID[i]);
    }
  }

  Serial.println("[DIAG] ===== AFTER =====");
  for (int i = 0; i < SERVO_NUM; i++) {
    if (st.Ping(ID[i]) != -1) {
      printConfig("AFTER", ID[i]);
      lastMode[i] = st.ReadMode(ID[i]);
    }
  }

  // Bring everyone to a known start position.
  for (int i = 0; i < SERVO_NUM; i++) {
    st.WritePosEx(ID[i], POS_A, MOVE_SPEED, MOVE_ACC);
  }
  delay(1200);
}

// Move one servo, then check whether its position actually changed.
bool sweepAndCheck(byte id) {
  int before = st.ReadPos(id);

  st.WritePosEx(id, POS_B, MOVE_SPEED, MOVE_ACC);
  delay(900);
  int mid = st.ReadPos(id);

  st.WritePosEx(id, POS_A, MOVE_SPEED, MOVE_ACC);
  delay(900);
  int after = st.ReadPos(id);

  int travel = abs(mid - before);

  Serial.print("[DIAG] ID ");
  Serial.print(id);
  Serial.print(" sweep before=");
  Serial.print(before);
  Serial.print(" mid=");
  Serial.print(mid);
  Serial.print(" back=");
  Serial.print(after);
  Serial.print(" travel=");
  Serial.print(travel);
  Serial.println(travel > 200 ? "  MOVED" : "  NO MOVE");

  return travel > 200;
}

void drawScreen() {
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_GREEN, TFT_BLACK);
  tft.setTextSize(2);
  tft.setCursor(10, 8);
  tft.println("SERVO DIAGNOSE");
  tft.drawFastHLine(0, 34, 320, TFT_DARKGREY);

  tft.setTextSize(2);
  int y = 46;
  for (int i = 0; i < SERVO_NUM; i++) {
    tft.setTextColor(moved[i] ? TFT_GREEN : TFT_RED, TFT_BLACK);
    tft.setCursor(10, y);
    tft.print("ID ");
    tft.print(ID[i]);
    tft.print(" mode=");
    tft.print(lastMode[i]);
    tft.print(moved[i] ? "  MOVED" : "  NO MOVE");
    y += 30;
  }
}

void loop() {
  for (int i = 0; i < SERVO_NUM; i++) {
    if (st.Ping(ID[i]) == -1) {
      moved[i] = false;
      continue;
    }
    printConfig("NOW", ID[i]);
    moved[i] = sweepAndCheck(ID[i]);
    lastMode[i] = st.ReadMode(ID[i]);
  }

  drawScreen();
  Serial.println("[DIAG] ---------------------------");
  delay(1500);
}
