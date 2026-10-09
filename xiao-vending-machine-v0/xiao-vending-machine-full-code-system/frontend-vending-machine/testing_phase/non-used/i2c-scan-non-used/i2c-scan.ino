#include <Wire.h>
#include <TFT_eSPI.h>

// =====================================================
// I2C SCANNER (diagnostic)
// =====================================================
// Scans both I2C buses on the Wio Terminal and shows what responds,
// directly on the screen (no serial monitor needed):
//   - Wire  (SERCOM3) = the external Grove I2C port  <- RFID should be here
//   - Wire1 (SERCOM4) = the internal accelerometer bus (proves I2C works)
//
// Expected: the Grove RFID reader answers at 0x28 on Wire.
// The onboard LIS3DHTR accelerometer usually answers at 0x18/0x19 on Wire1.
// =====================================================

TFT_eSPI tft;

int scanBus(TwoWire &bus, byte *out, int maxOut) {
  int n = 0;
  for (byte addr = 1; addr < 127; addr++) {
    bus.beginTransmission(addr);
    if (bus.endTransmission() == 0) {
      if (n < maxOut) out[n] = addr;
      n++;
    }
  }
  return n;
}

String listToString(byte *addrs, int n) {
  if (n == 0) return "NONE";
  String s = "";
  for (int i = 0; i < n; i++) {
    if (addrs[i] < 0x10) s += "0";
    s += String(addrs[i], HEX);
    if (i < n - 1) s += " ";
  }
  s.toUpperCase();
  return "0x" + s;
}

void drawResults(byte *w0, int n0, byte *w1, int n1, bool rfidFound) {
  tft.fillScreen(TFT_BLACK);

  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.setTextSize(3);
  tft.setCursor(10, 10);
  tft.println("I2C SCAN");

  tft.drawFastHLine(0, 50, 320, TFT_DARKGREY);

  tft.setTextSize(2);

  tft.setTextColor(TFT_CYAN, TFT_BLACK);
  tft.setCursor(10, 65);
  tft.println("Grove (Wire):");
  tft.setTextColor(rfidFound ? TFT_GREEN : TFT_RED, TFT_BLACK);
  tft.setCursor(20, 90);
  tft.println(listToString(w0, n0));

  tft.setTextColor(TFT_CYAN, TFT_BLACK);
  tft.setCursor(10, 130);
  tft.println("Internal (Wire1):");
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.setCursor(20, 155);
  tft.println(listToString(w1, n1));

  tft.setTextColor(rfidFound ? TFT_GREEN : TFT_YELLOW, TFT_BLACK);
  tft.setCursor(10, 200);
  if (rfidFound) {
    tft.println("RFID 0x28 FOUND!");
  } else {
    tft.println("No 0x28 on Grove");
  }
}

void setup() {
  Serial.begin(115200);

  tft.init();
  tft.setRotation(3);
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.setTextSize(2);
  tft.setCursor(10, 10);
  tft.println("Starting I2C scan...");

  Wire.begin();
  Wire1.begin();

  Serial.println("[I2C] Scanner start");
}

void loop() {
  byte w0[16];
  byte w1[16];
  int n0 = scanBus(Wire, w0, 16);
  int n1 = scanBus(Wire1, w1, 16);

  bool rfidFound = false;
  for (int i = 0; i < n0 && i < 16; i++) {
    if (w0[i] == 0x28) rfidFound = true;
  }

  Serial.print("[I2C] Grove(Wire) devices: ");
  Serial.println(listToString(w0, n0));
  Serial.print("[I2C] Internal(Wire1) devices: ");
  Serial.println(listToString(w1, n1));
  Serial.println(rfidFound ? "[I2C] RFID 0x28 FOUND on Grove" : "[I2C] RFID 0x28 NOT found on Grove");

  drawResults(w0, n0, w1, n1, rfidFound);

  delay(1500);
}
