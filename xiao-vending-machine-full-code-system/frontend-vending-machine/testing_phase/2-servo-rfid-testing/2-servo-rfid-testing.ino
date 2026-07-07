#include <Wire.h>
#include <TFT_eSPI.h>
#include "Emakefun_RFID.h"
#include "SCServo.h"

// =====================================================
// TEST 2: SERVO + RFID  (write + read + dispense)
// =====================================================
// On boot every servo returns to its ZERO station (the values found with
// 1-a-servo-locate / 1-b-servo-zero-porint). Then the Wio Terminal is a
// tiny RFID write/read station:
//
//   Button A : WRITE a "Matthew" balance card
//   Button B : WRITE an "Alice" prepaid card
//   Button C : READ the card and dispense
//
// After pressing a button, present a card to the reader.
//
// On READ (button C):
//   - Alice  / prepaid : fixed order -> servo 1 x1, servo 3 x2, servo 4 x1
//                        (see PREPAID_COUNTS below).
//   - Matthew / balance: opens a selection page; use the joystick to pick
//                        a servo id and how many times, then dispense.
//
// One "dispense" of a servo = ZERO -> MAX -> ZERO, using that servo's
// stored ZERO/MAX positions (a full actuation of the mechanism).
//
// Card payload (compact JSON) is stored across MIFARE blocks 4,5,6,8,9,10
// with key FF FF FF FF FF FF, the same layout the reader already used.
// =====================================================

// ---------------- CARD PAYLOADS (written to the tag) ----------------
const char* JSON_MATTHEW = "{\"name\":\"Matthew\",\"card\":{\"type\":\"balance\"}}";
const char* JSON_ALICE   = "{\"name\":\"Alice\",\"card\":{\"type\":\"prepaid\"}}";

// ---------------- LCD ----------------
TFT_eSPI tft;

// ---------------- RFID ----------------
#define RFID_ADDR 0x28
MFRC522 mfrc522(RFID_ADDR);
MFRC522::MIFARE_Key rfidKey;
bool rfidReady = false;

// Must match the reader/writer. Do not use trailer blocks 7 or 11.
const byte DATA_BLOCKS[] = {4, 5, 6, 8, 9, 10};
const int  DATA_BLOCK_COUNT = sizeof(DATA_BLOCKS) / sizeof(DATA_BLOCKS[0]);

// ---------------- SERVO ----------------
#define SERVO_NUM 4
SMS_STS st;
byte ID[SERVO_NUM] = {1, 2, 3, 4};

// ZERO (home) + MAX positions per servo id 1,2,3,4, captured with
// 1-a-servo-locate and verified with 1-b-servo-zero-porint. Keep these in
// sync with 1-b: re-run 1-a to recapture.
const s16 ZERO_POS[SERVO_NUM] = {2490, 2598, 2897, 3651};
const s16 MAX_POS[SERVO_NUM]  = {250, 262, 905, 1552};

const u16 MOVE_SPEED     = 2000;
const u8  MOVE_ACC       = 50;
const int SETTLE_TIMEOUT = 3000;   // ms max wait for one move to finish
const int ARRIVE_TOL     = 20;     // units; how close to target counts as "arrived"

// Alice / prepaid fixed recipe: how many times each servo dispenses.
// "servo 1,3,4 once and servo 3 twice" -> id1 x1, id2 x0, id3 x2, id4 x1.
const int PREPAID_COUNTS[SERVO_NUM] = {1, 0, 2, 1};

bool present[SERVO_NUM] = {false, false, false, false};

// ---- button edge tracking (idle loop) ----
bool prevA = false, prevB = false, prevC = false;

// ---------------- SERVO HELPERS ----------------
// Command a servo to a target and block until it actually reaches it
// (within ARRIVE_TOL) or clearly stalls at its limit, or SETTLE_TIMEOUT
// elapses. Waiting for arrival - rather than "motion got small" -
// guarantees each leg travels the full distance before the next command.
// The stall exit only fires AFTER real motion has started, so it can
// never cut a sweep short before the servo has begun to move.
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

    if (abs(now - (int)target) <= ARRIVE_TOL) return;              // arrived
    if (!started && startPos >= 0 && abs(now - startPos) > 40) started = true;
    if (started && abs(now - last) < 4) return;                    // stopped at limit
    last = now;
  }
}

void homeAllToZero() {
  for (int i = 0; i < SERVO_NUM; i++) {
    if (present[i]) st.WritePosEx(ID[i], ZERO_POS[i], MOVE_SPEED, MOVE_ACC);
  }
  // Wait for all of them (they travel in parallel).
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

// One full actuation of servo index i: ZERO -> MAX -> ZERO. Each leg runs
// all the way (full travel), so it never stops "a little bit" short.
void dispenseOnce(int i) {
  if (!present[i]) return;
  moveTo(ID[i], MAX_POS[i]);
  moveTo(ID[i], ZERO_POS[i]);
}

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

void showIdle() {
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_GREEN, TFT_BLACK);
  tft.setTextSize(3);
  tft.setCursor(15, 12);
  tft.println("SERVO+RFID");
  tft.drawFastHLine(0, 52, 320, TFT_DARKGREY);

  if (!rfidReady) {
    tft.setTextSize(2);
    tft.setTextColor(TFT_YELLOW, TFT_BLACK);
    tft.setCursor(15, 74);
    tft.println("RFID not ready");
    tft.setTextColor(TFT_WHITE, TFT_BLACK);
    tft.setCursor(15, 104);
    tft.println("Press A to retry");
    return;
  }

  tft.setTextSize(2);
  tft.setTextColor(TFT_CYAN, TFT_BLACK);
  tft.setCursor(15, 70);
  tft.println("A: write Matthew");
  tft.setCursor(15, 105);
  tft.println("B: write Alice");
  tft.setCursor(15, 140);
  tft.println("C: read + dispense");

  tft.setTextSize(1);
  tft.setTextColor(TFT_DARKGREY, TFT_BLACK);
  tft.setCursor(15, 185);
  tft.println("Servos homed to ZERO.");
  tft.setCursor(15, 200);
  tft.println("Press a button, then present a card.");
}

void showDispensing(const char* who, byte id, int t, int times) {
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_GREEN, TFT_BLACK);
  tft.setTextSize(3);
  tft.setCursor(20, 25);
  tft.println("DISPENSING");
  tft.drawFastHLine(0, 70, 320, TFT_DARKGREY);

  tft.setTextSize(2);
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.setCursor(20, 100);
  tft.print("Card: ");
  tft.println(who);

  tft.setTextColor(TFT_CYAN, TFT_BLACK);
  tft.setCursor(20, 140);
  tft.print("Servo ");
  tft.print(id);

  tft.setCursor(20, 175);
  tft.print("Move ");
  tft.print(t);
  tft.print("/");
  tft.print(times);
}

// ---------------- DISPENSE ----------------
void dispenseServo(int idx, int times, const char* who) {
  for (int t = 1; t <= times; t++) {
    Serial.print("[DISPENSE] ");
    Serial.print(who);
    Serial.print(" servo ");
    Serial.print(ID[idx]);
    Serial.print(" move ");
    Serial.print(t);
    Serial.print("/");
    Serial.println(times);

    showDispensing(who, ID[idx], t, times);
    dispenseOnce(idx);
  }
}

void dispensePrepaid() {
  Serial.println("[PREPAID] Alice card -> fixed recipe");
  for (int i = 0; i < SERVO_NUM; i++) {
    if (PREPAID_COUNTS[i] > 0) {
      dispenseServo(i, PREPAID_COUNTS[i], "Alice");
    }
  }
}

// Matthew / balance: dashboard with all 4 ids + OK / CLEAR buttons.
//   Joystick Up/Down    : move the highlight (ID1..ID4 -> OK -> CLEAR)
//   Joystick Left/Right : change the highlighted ID's times (0..9)
//   Joystick Press      : "click" the highlighted item
//                           - on an ID   : add one rotation (+1 time)
//                           - on OK      : rotate every selected id
//                           - on CLEAR   : reset all times to 0
//   Button A            : cancel / back
#define SEL_OK    SERVO_NUM        // cursor index of the OK button
#define SEL_CLEAR (SERVO_NUM + 1)  // cursor index of the CLEAR button
#define SEL_ITEMS (SERVO_NUM + 2)  // total selectable items

void drawSelButton(int x, int y, int w, int h, const char* label, bool hl, uint16_t accent) {
  uint16_t fill = hl ? accent : TFT_BLACK;
  uint16_t txt  = hl ? TFT_BLACK : accent;
  tft.fillRect(x, y, w, h, fill);
  tft.drawRect(x, y, w, h, accent);
  tft.setTextSize(2);
  tft.setTextColor(txt, fill);
  tft.setCursor(x + 14, y + 9);
  tft.print(label);
}

void drawMatthewDashboard(int cursor, const int* times) {
  tft.fillScreen(TFT_BLACK);

  tft.setTextColor(TFT_GREEN, TFT_BLACK);
  tft.setTextSize(2);
  tft.setCursor(10, 6);
  tft.println("MATTHEW SELECT");
  tft.drawFastHLine(0, 30, 320, TFT_DARKGREY);

  tft.setTextSize(2);
  int y = 40;
  for (int i = 0; i < SERVO_NUM; i++) {
    bool hl = (cursor == i);
    uint16_t bg = hl ? TFT_BLUE : TFT_BLACK;
    if (hl) tft.fillRect(6, y - 2, 308, 24, TFT_BLUE);
    tft.setTextColor(times[i] > 0 ? TFT_GREEN : TFT_WHITE, bg);
    tft.setCursor(14, y);
    tft.print("ID ");
    tft.print(ID[i]);
    tft.setCursor(150, y);
    tft.print("times: ");
    tft.print(times[i]);
    y += 26;
  }

  tft.drawFastHLine(0, y + 2, 320, TFT_DARKGREY);

  int by = y + 10;
  drawSelButton(20, by, 120, 34, "OK", cursor == SEL_OK, TFT_GREEN);
  drawSelButton(170, by, 130, 34, "CLEAR", cursor == SEL_CLEAR, TFT_RED);

  tft.setTextSize(1);
  tft.setTextColor(TFT_DARKGREY, TFT_BLACK);
  tft.setCursor(10, 206);
  tft.println("Joy U/D: move   L/R: times   Press: click");
  tft.setCursor(10, 220);
  tft.println("Click ID=+1  OK=rotate  CLEAR=reset  A:back");
}

void selectionPage() {
  int times[SERVO_NUM] = {0, 0, 0, 0};
  int cursor = 0;
  drawMatthewDashboard(cursor, times);

  // Seed edge state from the current pins so a button still held from the
  // read press is not treated as an immediate click.
  bool pUp    = digitalRead(WIO_5S_UP) == LOW;
  bool pDown  = digitalRead(WIO_5S_DOWN) == LOW;
  bool pLeft  = digitalRead(WIO_5S_LEFT) == LOW;
  bool pRight = digitalRead(WIO_5S_RIGHT) == LOW;
  bool pPress = digitalRead(WIO_5S_PRESS) == LOW;
  bool pA     = digitalRead(WIO_KEY_A) == LOW;

  while (true) {
    bool up    = digitalRead(WIO_5S_UP) == LOW;
    bool down  = digitalRead(WIO_5S_DOWN) == LOW;
    bool left  = digitalRead(WIO_5S_LEFT) == LOW;
    bool right = digitalRead(WIO_5S_RIGHT) == LOW;
    bool press = digitalRead(WIO_5S_PRESS) == LOW;
    bool a     = digitalRead(WIO_KEY_A) == LOW;

    bool changed = false;

    if (down && !pDown) { cursor = (cursor + 1) % SEL_ITEMS; changed = true; }
    if (up && !pUp)     { cursor = (cursor + SEL_ITEMS - 1) % SEL_ITEMS; changed = true; }

    if (cursor < SERVO_NUM) {
      if (right && !pRight) { if (times[cursor] < 9) times[cursor]++; changed = true; }
      if (left && !pLeft)   { if (times[cursor] > 0) times[cursor]--; changed = true; }
    }

    if (press && !pPress) {
      if (cursor < SERVO_NUM) {
        if (times[cursor] < 9) times[cursor]++;
        changed = true;

      } else if (cursor == SEL_OK) {
        bool any = false;
        for (int i = 0; i < SERVO_NUM; i++) if (times[i] > 0) any = true;

        if (!any) {
          displayScreen("MATTHEW", "Nothing selected", "Click an ID first", "", TFT_YELLOW);
          delay(1200);
          drawMatthewDashboard(cursor, times);
        } else {
          Serial.print("[BALANCE] Matthew OK ->");
          for (int i = 0; i < SERVO_NUM; i++) {
            if (times[i] > 0) {
              Serial.print(" id");
              Serial.print(ID[i]);
              Serial.print("x");
              Serial.print(times[i]);
            }
          }
          Serial.println();

          for (int i = 0; i < SERVO_NUM; i++) {
            if (times[i] > 0) dispenseServo(i, times[i], "Matthew");
          }
          return;
        }

      } else {  // SEL_CLEAR
        for (int i = 0; i < SERVO_NUM; i++) times[i] = 0;
        Serial.println("[BALANCE] selections cleared");
        changed = true;
      }
    }

    if (a && !pA) {
      Serial.println("[BALANCE] selection cancelled");
      return;
    }

    pUp = up; pDown = down; pLeft = left; pRight = right;
    pPress = press; pA = a;

    if (changed) drawMatthewDashboard(cursor, times);
    delay(30);
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
    if (!authenticateBlock(blockAddr)) return false;

    byte buffer[18];
    byte size = sizeof(buffer);
    MFRC522::StatusCode status =
      (MFRC522::StatusCode)mfrc522.MIFARE_Read(blockAddr, buffer, &size);
    if (status != MFRC522::STATUS_OK) {
      Serial.print("[RFID] Read failed block ");
      Serial.print(blockAddr);
      Serial.print(": ");
      Serial.println(mfrc522.GetStatusCodeName(status));
      return false;
    }

    for (int i = 0; i < 16; i++) {
      if (buffer[i] == 0) continue;
      payload += (char)buffer[i];
    }
  }

  payload.trim();
  Serial.print("[RFID] Payload from card: ");
  Serial.println(payload);
  return payload.length() > 0;
}

bool writePayloadToCard(const char* payload) {
  int len = strlen(payload);
  if (len > DATA_BLOCK_COUNT * 16) {
    Serial.println("[RFID] Payload too long for the data blocks");
    return false;
  }

  for (int b = 0; b < DATA_BLOCK_COUNT; b++) {
    byte blockAddr = DATA_BLOCKS[b];

    byte buffer[16];
    for (int i = 0; i < 16; i++) {
      int idx = b * 16 + i;
      buffer[i] = (idx < len) ? (byte)payload[idx] : 0x00;
    }

    if (!authenticateBlock(blockAddr)) return false;

    MFRC522::StatusCode status =
      (MFRC522::StatusCode)mfrc522.MIFARE_Write(blockAddr, buffer, 16);
    if (status != MFRC522::STATUS_OK) {
      Serial.print("[RFID] Write failed block ");
      Serial.print(blockAddr);
      Serial.print(": ");
      Serial.println(mfrc522.GetStatusCodeName(status));
      return false;
    }
  }
  return true;
}

void initRFID() {
  displayScreen("SERVO + RFID", "Starting RFID...", "", "", TFT_CYAN);

  // Grove I2C port is on Wire1 (SERCOM4). Reader answers at 0x28.
  // Emakefun_RFID.cpp is mapped to Wire1 (see "#define Wire Wire1").
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

  showIdle();
}

// Wait for a card to be presented. Joystick press cancels.
bool waitForCard(unsigned long timeoutMs) {
  unsigned long start = millis();
  while (millis() - start < timeoutMs) {
    if (digitalRead(WIO_5S_PRESS) == LOW) return false;
    if (mfrc522.PICC_IsNewCardPresent() && mfrc522.PICC_ReadCardSerial()) return true;
    delay(50);
  }
  return false;
}

// ---------------- FLOWS ----------------
void writeCardFlow(const char* payload, const char* who) {
  if (!rfidReady) return;

  displayScreen("WRITE CARD", who, "Present card...", "(joy press=cancel)", TFT_CYAN);

  if (!waitForCard(10000)) {
    displayScreen("WRITE CARD", "No card / cancelled", "", "", TFT_YELLOW);
    delay(1200);
    showIdle();
    return;
  }

  String uid = getScannedUIDString();
  Serial.print("[RFID] Writing ");
  Serial.print(who);
  Serial.print(" to UID: ");
  Serial.println(uid);

  bool ok = writePayloadToCard(payload);
  stopRFID();
  delay(200);

  if (ok) {
    Serial.print("[RFID] Wrote payload: ");
    Serial.println(payload);
    displayScreen("WRITE OK", who, "card written", "", TFT_GREEN);
  } else {
    displayScreen("WRITE FAILED", who, "try again", "", TFT_RED);
  }
  delay(1500);
  showIdle();
}

void readCardFlow() {
  if (!rfidReady) return;

  displayScreen("READ CARD", "Present card...", "(joy press=cancel)", "", TFT_CYAN);

  if (!waitForCard(10000)) {
    displayScreen("READ CARD", "No card / cancelled", "", "", TFT_YELLOW);
    delay(1200);
    showIdle();
    return;
  }

  String uid = getScannedUIDString();
  Serial.print("[RFID] Scanned UID: ");
  Serial.println(uid);

  displayScreen("CARD DETECTED", uid.c_str(), "Reading...", "", TFT_CYAN);

  String payload = "";
  bool readOk = readPayloadFromCard(payload);
  stopRFID();
  delay(200);

  if (!readOk || payload.length() == 0) {
    displayScreen("CARD ERROR", "No payload", "Try another card", "", TFT_RED);
    delay(1500);
    showIdle();
    return;
  }

  String name = jsonValue(payload, "name");
  String type = jsonValue(payload, "type");
  Serial.print("[RFID] name=");
  Serial.print(name);
  Serial.print("  type=");
  Serial.println(type);

  if (name == "Alice" && type == "prepaid") {
    displayScreen("CARD: ALICE", "type: prepaid", "Dispensing...", "", TFT_GREEN);
    delay(800);
    dispensePrepaid();
    displayScreen("DONE", "Alice order done", "Scan again", "", TFT_GREEN);
    delay(1500);
    showIdle();

  } else if (name == "Matthew" && type == "balance") {
    displayScreen("CARD: MATTHEW", "type: balance", "Choose dispense", "", TFT_GREEN);
    delay(800);
    selectionPage();
    displayScreen("DONE", "Matthew done", "Scan again", "", TFT_GREEN);
    delay(1200);
    showIdle();

  } else {
    Serial.println("[RFID] Card not recognized");
    displayScreen("UNKNOWN CARD", name.c_str(), type.c_str(), "Not recognized", TFT_RED);
    delay(1800);
    showIdle();
  }
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

  // Requirement 1: bring every servo back to its ZERO station on boot.
  for (int i = 0; i < SERVO_NUM; i++) {
    present[i] = (st.Ping(ID[i]) != -1);
    if (present[i]) {
      st.EnableTorque(ID[i], 1);
    } else {
      Serial.print("[TEST] WARNING: servo ID ");
      Serial.print(ID[i]);
      Serial.println(" not found");
    }
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

  Serial.println("[TEST] Servo + RFID write/read station start");
  Serial.println("[TEST] A=write Matthew  B=write Alice  C=read+dispense");

  initRFID();
}

// ---------------- LOOP ----------------
void loop() {
  bool a = digitalRead(WIO_KEY_A) == LOW;
  bool b = digitalRead(WIO_KEY_B) == LOW;
  bool c = digitalRead(WIO_KEY_C) == LOW;

  if (!rfidReady) {
    if (a && !prevA) initRFID();
    prevA = a; prevB = b; prevC = c;
    delay(80);
    return;
  }

  bool ranFlow = false;
  if (a && !prevA) {
    writeCardFlow(JSON_MATTHEW, "Matthew");
    ranFlow = true;
  } else if (b && !prevB) {
    writeCardFlow(JSON_ALICE, "Alice");
    ranFlow = true;
  } else if (c && !prevC) {
    readCardFlow();
    ranFlow = true;
  }

  if (ranFlow) {
    // A flow blocks for seconds; re-read so buttons pressed during it
    // (e.g. A to cancel the selection page) do not trigger a new action.
    prevA = digitalRead(WIO_KEY_A) == LOW;
    prevB = digitalRead(WIO_KEY_B) == LOW;
    prevC = digitalRead(WIO_KEY_C) == LOW;
  } else {
    prevA = a; prevB = b; prevC = c;
  }
  delay(40);
}
