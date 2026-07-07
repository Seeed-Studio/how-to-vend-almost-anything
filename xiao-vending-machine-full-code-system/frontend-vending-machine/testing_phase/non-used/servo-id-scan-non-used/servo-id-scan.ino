#include <TFT_eSPI.h>
#include "SCServo.h"

// =====================================================
// SERVO BUS ID SCANNER (diagnostic)
// =====================================================
// Pings every ID on the serial servo bus and reports which servos
// actually respond, plus their current position. Use this to find out
// what IDs your connected servos are set to.
//
// The 1/2/3-test sketches assume the four servos are set to IDs 1,2,3,4.
// If only some IDs respond here, that is why only some servos move.
// =====================================================

TFT_eSPI tft;
SMS_STS st;

// IDs to probe. Each absent ID costs ~100ms (IOTimeOut), so keep the
// range modest. Raise SCAN_MAX to 253 for an exhaustive (slow) scan.
const int SCAN_MIN = 0;
const int SCAN_MAX = 30;

void setup() {
  Serial.begin(115200);

  tft.init();
  tft.setRotation(3);
  tft.fillScreen(TFT_BLACK);

  Serial1.begin(1000000);
  st.pSerial = &Serial1;
  delay(500);

  Serial.println("[SCAN] Servo bus ID scanner ready");
}

void loop() {
  Serial.print("[SCAN] Pinging IDs ");
  Serial.print(SCAN_MIN);
  Serial.print("..");
  Serial.println(SCAN_MAX);

  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_GREEN, TFT_BLACK);
  tft.setTextSize(2);
  tft.setCursor(10, 8);
  tft.println("SERVO ID SCAN");
  tft.drawFastHLine(0, 34, 320, TFT_DARKGREY);

  tft.setTextSize(2);
  int found = 0;
  int col = 0;
  int x = 10;
  int y = 44;

  for (int id = SCAN_MIN; id <= SCAN_MAX; id++) {
    int res = st.Ping(id);

    if (res != -1) {
      found++;
      int pos = st.ReadPos(id);

      Serial.print("[SCAN] Found servo ID ");
      Serial.print(id);
      Serial.print("  pos=");
      Serial.println(pos);

      tft.setTextColor(TFT_WHITE, TFT_BLACK);
      tft.setCursor(x, y);
      tft.print("ID ");
      tft.print(id);
      tft.print(" p=");
      tft.print(pos);

      y += 26;
      if (y > 210) {   // wrap into a second column
        y = 44;
        col++;
        x = 10 + col * 150;
      }
    }

    delay(20);
  }

  Serial.print("[SCAN] Total servos found: ");
  Serial.println(found);
  Serial.println("[SCAN] ----------------------------");

  tft.setTextColor(found == 4 ? TFT_GREEN : TFT_YELLOW, TFT_BLACK);
  tft.setTextSize(2);
  tft.setCursor(10, 216);
  tft.print("Total found: ");
  tft.print(found);

  delay(2500);
}
