# Official Frontend Wio Terminal

Production firmware for the customer-facing Wio Terminal in the vending machine.
This is the one you upload to the machine that dispenses products. The other Wio
(`backend-full/wio-rfid-writer`) only writes cards.

## What it does

For every card scanned:

1. **Read** the card and its selling `type` (written by the backend Wio writer):
   - `{"type":"direct","user_name":"..","order_number":"..","v":1}`
   - `{"type":"selecting","user_name":"..","v":1}`
2. **Ask permission** from `backend-full` - no permission, no dispense:
   `POST /api/frontend/verify-card`.
3. **Dispense**:
   - `direct` - dispense the reserved product (`servo_id` x `quantity`).
   - `selecting` - the customer picks products on the LCD with the joystick,
     bounded by their balance and the live stock; `POST /api/frontend/selecting/checkout`
     spends the balance and returns the servo plan.
4. **Report** so the backend deducts / finalizes:
   `POST /api/frontend/dispense-complete` (a reported failure rolls stock/balance back).

If the backend says the column needs a refill (or stock/balance is insufficient),
the machine shows an error and does **not** dispense - even for a valid card.

## Hardware

- **Wio Terminal** (Seeeduino SAMD, FQBN `Seeeduino:samd:seeed_wio_terminal`).
- **Emakefun MFRC522** RFID reader on the Grove I2C port (`Wire1`, address `0x28`).
  Payload spans MIFARE Classic 1K blocks 4,5,6,8,9,10, key `FF FF FF FF FF FF`.
- **Feetech SMS/STS bus servos** ids 1..4 on `Serial1` @ 1,000,000 baud.
  Positions use the ZERO/MAX values calibrated with the `testing_phase` 1-a / 1-b
  sketches. One dispense = ZERO -> MAX -> ZERO.

## Controls

- **Button A** - start the RFID reader if it did not come up at boot.
- **Joystick** (selecting cards only) - Up/Down move, Left/Right change quantity,
  Press pick, Button A cancels.

## Configure before flashing

Edit the top of `official_frontend_wio_terminal.ino`:

```cpp
const char* WIFI_SSID       = "SEEED-MKT";
const char* WIFI_PASSWORD   = "edgemaker2023";
const char* BACKEND_BASE_URL = "http://192.168.1.20:3000"; // your backend, no trailing slash
const char* DEVICE_ID       = "frontend-1";        // must exist in backend data/devices.csv
const char* API_KEY         = "FRONTEND_1_SECRET";
```

If you recalibrate the mechanism, update `ZERO_POS` / `MAX_POS` from the
`testing_phase/1-a-servo-locate` and `1-b-servo-zero-porint` sketches.

## Build

The servo and RFID libraries are vendored in this folder, so the sketch compiles
standalone. `TFT_eSPI.h` is provided by the Seeed LCD library (`Seeed_GFX` /
`Seeed_Arduino_LCD`); WiFi by `Seeed Arduino rpcWiFi`.

```bash
arduino-cli compile --fqbn Seeeduino:samd:seeed_wio_terminal official_frontend_wio_terminal
arduino-cli upload  --fqbn Seeeduino:samd:seeed_wio_terminal -p <PORT> official_frontend_wio_terminal
```
