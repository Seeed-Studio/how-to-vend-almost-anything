# Firmware reference (the two Wio Terminals)

Both firmwares target the **Wio Terminal** (`FQBN Seeeduino:samd:seeed_wio_terminal`,
serial monitor `115200`). Each sketch folder vendors the servo library
(`SCServo.h`, `SMS_STS.*`, `SCSCL.*`, `SCS.*`, `SCSerial.*`, `INST.h`) and RFID
library (`Emakefun_RFID.*`) so it compiles standalone. `TFT_eSPI.h` comes from
the Seeed LCD library (`Seeed_GFX` / `Seeed_Arduino_LCD`); WiFi from
`Seeed Arduino rpcWiFi`.

## One-time toolchain

```bash
arduino-cli config init
arduino-cli config add board_manager.additional_urls https://files.seeedstudio.com/arduino/package_seeeduino_boards_index.json
arduino-cli core update-index
arduino-cli core install Seeeduino:samd
# then install the Seeed LCD + rpcWiFi libraries via Library Manager / arduino-cli lib install
```

## Build + flash any sketch

```bash
arduino-cli board list                                  # find the port (/dev/cu.usbmodemXXXX on macOS)
cd frontend-vending-machine/official_frontend_wio_terminal
arduino-cli compile --fqbn Seeeduino:samd:seeed_wio_terminal .
arduino-cli upload  -p /dev/cu.usbmodemXXXX --fqbn Seeeduino:samd:seeed_wio_terminal .
```

The two identical boards each expose a unique serial number; use it (or the
Config page's port dropdown) to tell the reader and writer apart.

## Frontend reader — `official_frontend_wio_terminal.ino`

The customer-facing unit that dispenses. Config block at the top:

```cpp
const char* WIFI_SSID       = "SEEED-MKT";
const char* WIFI_PASSWORD   = "edgemaker2023";
const char* BACKEND_BASE_URL = "http://192.168.1.20:3000"; // your backend, NO trailing slash
const char* DEVICE_ID       = "frontend-1";                // must exist enabled in devices.csv
const char* API_KEY         = "FRONTEND_1_SECRET";
```

Per card it: reads the card `type`, `POST /api/frontend/verify-card`, dispenses
(direct = reserved product; selecting = on-screen pick then
`/selecting/checkout`), then `POST /api/frontend/dispense-complete`. If the
backend says `needs_refill` or balance/stock is short, it shows an error and
does not dispense.

**Controls:** Button **A** starts the RFID reader if it did not come up at boot.
For selecting cards, the joystick moves (Up/Down), changes quantity (Left/Right),
picks (Press); Button **A** cancels.

## Backend writer — `wio_rfid_writer.ino`

Sits at the operator desk and encodes cards. Config block:

```cpp
const char* WIFI_SSID     = "SEEED-MKT";
const char* WIFI_PASSWORD = "edgemaker2023";
const char* API_BASE      = "http://192.168.1.20:3000";   // NOTE: variable is API_BASE, not BACKEND_BASE_URL
const char* DEVICE_ID     = "wio-rfid-writer";
const char* API_KEY       = "WIO_WRITER_SECRET";
```

It polls `GET /api/rfid-writer/next-job`, writes the payload when a card is
present, and reports via `POST /api/rfid-writer/job-result`; heartbeats with
`POST /api/rfid-writer/status`. Flash once — no per-card upload.

> `localhost` on a Wio means the Wio itself. Always point the URL at the PC's LAN
> IP (topology B/C) or the public host (D), with no trailing slash.

## Servos (Feetech SMS/STS bus servos, ids 1..4)

- Bus on `Serial1` @ **1,000,000** baud; external **6–8 V** supply with common GND.
- Positions are `0..4095` over 360° (`1024 units = 90°`). Each servo has a
  calibrated `ZERO` (home) and `MAX` (fully open). One **dispense = ZERO → MAX → ZERO**.
- `MAX` may be **below** `ZERO` (servo opens in the decreasing direction) —
  positions are absolute, so direction does not matter.

```cpp
// reader .ino — index = servo id 1,2,3,4 (example values captured 2026-07-04)
const s16 ZERO_POS[SERVO_NUM] = {2490, 2598, 2897, 3651};
const s16 MAX_POS[SERVO_NUM]  = {250, 262, 905, 1552};
```

### Recalibration workflow (when the mechanism changes)

Use the bring-up sketches in `frontend-vending-machine/testing_phase/` **in order**:

```text
0-servo-set-id/        program each servo's id to 1,2,3,4 (one servo at a time)
1-a-servo-locate/      jog each servo to ZERO (button B) and MAX (button C); prints the two const lines
1-b-servo-zero-porint/ paste the numbers, home to ZERO, run a sweep, confirm all 4 moved
```

Copy the two `const` lines 1-a prints into the reader `.ino` (and keep the
testing sketches in sync). `1-b`'s folder name keeps its original spelling
(`porint`). 1-a/1-b auto-normalize a servo to single-turn position mode on boot.

Other tuning constants in the reader `.ino`: `MOVE_SPEED` (2000), `MOVE_ACC`
(50), `SETTLE_TIMEOUT` (3000 ms per leg), `ARRIVE_TOL` (20 units), `SERVO_NUM`
(4) and `ID[]` (`{1,2,3,4}`).

## RFID (Emakefun MFRC522)

- I2C address `0x28` on **`Wire1`** (Grove I2C port).
- Payload spans MIFARE Classic 1K blocks **`4,5,6,8,9,10`** (avoids sector
  trailers 7 and 11), key **`FF FF FF FF FF FF`**. Max **96 bytes** (6×16).
- The **writer and reader must use the same blocks + key**, or reads fail. Cards
  must be blank/default MIFARE Classic 1K so Key A can write.

Card payloads (written by the writer / `topup-and-prepare-card`):

```jsonc
{"type":"direct","user_name":"..","order_number":"..","v":1}   // ORDER job
{"type":"selecting","user_name":"..","v":1}                    // BALANCE job (balance stays in cards.csv)
```

## Troubleshooting

- **Servo answers but won't move (`NO MOVE`):** usually stuck in wheel/multi-turn
  mode — re-run `1-a` (normalizes on boot) or `testing_phase/non-used/servo-diagnose-non-used/`.
  Check id, and the 6–8 V supply with common GND.
- **Servo missing (grey / failed Ping):** check id (`servo-id-scan-non-used/`),
  wiring, power.
- **`RFID NOT FOUND` / version 0x00 or 0xFF:** wrong port — use the Grove I2C
  port (`Wire1`, `0x28`); press **A** to retry. Verify with `i2c-scan-non-used/`.
- **WiFi never connects / attempt counter stalls:** the RTL8720 wireless-core
  firmware likely needs updating (the common first-time cause). The sketch bounds
  the attempt (~15 s) so boot always continues and retries on the next scan.
- **`401` / requests rejected:** the sketch `DEVICE_ID`/`API_KEY` must match an
  `enabled=true` row in `backend-full/data/devices.csv`.
- **`BACKEND ERROR` / no reply:** backend not running, wrong URL/port, trailing
  slash, or the Wio and PC are on different networks. The Config page flags a
  network mismatch.

## More detail

The `testing_phase/` sketches each have a `README.md` (LCD/serial examples), and
`testing_phase/README.md` walks the whole bring-up path. See
[reference-deployment.md](reference-deployment.md) for the offline MCU-only sketch
(`2-servo-rfid-testing`) used in topology A.
