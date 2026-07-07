# Wio Terminal Test Phase

Incremental hardware bring-up tests for the Wio Terminal vending-machine
front end. Each test builds on the previous one, so run them in order:

| # | Folder | Adds | What it proves |
|---|--------|------|----------------|
| 1-a | [`1-a-servo-locate/`](1-a-servo-locate/) | jog + capture | Find each servo's ZERO + MAX (8 numbers) with buttons/joystick |
| 1-b | [`1-b-servo-zero-porint/`](1-b-servo-zero-porint/) | home + range test | Home all servos to ZERO and verify the MAX travel from 1-a |
| 2 | [`2-servo-rfid-testing/`](2-servo-rfid-testing/) | + Emakefun RFID | Write Matthew/Alice cards, then read one and dispense per card |
| 3 (PC) | [`3-backend-wifi-testing/`](3-backend-wifi-testing/) | + Node backend | PC server: prints its IP, verifies a card (`true`/`false`), logs the dispense report |
| 3 (Wio) | [`3-wio-terminal-wifi-testing/`](3-wio-terminal-wifi-testing/) | + WiFi | Test 2 + WiFi: each read is verified by the backend, then reports what it dispensed |

Tests `1-a` and `1-b` are the servo calibration pair: `1-a` is an
interactive tool that finds, for every servo, its zero (home) station and
its maximum travel, then prints the 8 numbers; `1-b` takes those 8 numbers
and drives the servos to zero and back out to max to confirm the range.

Phase 3 is a **pair** that runs together: the PC backend
`3-backend-wifi-testing` and the Wio sketch `3-wio-terminal-wifi-testing`
(start the backend first, then point the Wio's `BACKEND_BASE` at it).

The original single-sketch demos are kept for reference as
`1-servo-testing-non-used/` and `3-servero-rfid-wifi-testing-non-used/`.
Other helpers live alongside: `0-servo-set-id`, `servo-id-scan`,
`servo-diagnose`, `i2c-scan`, `card-writer`, `blank`.

The Wio sketches copy in the servo library files (`SCServo.h`, `SMS_STS.*`,
`SCSCL.*`, `SCS.*`, `SCSerial.*`, `INST.h`) and the RFID library files
(`Emakefun_RFID.*`) so every sketch compiles on its own. The backend is
plain Node.js with no dependencies.

## The servo motion

Serial servo positions are `0..4095` over 360 degrees, so 90 degrees is
1024 units.

- The original **`*-non-used`** demos run a 4-phase sweep: a "phase" moves
  servos `1..N` by +90 degrees, holds, then returns home (~2s), defaulting
  to `POS_HOME = 2048` / `POS_90 = 3072`.

  ```
  Phase 1 -> servo 1
  Phase 2 -> servos 1,2
  Phase 3 -> servos 1,2,3
  Phase 4 -> servos 1,2,3,4
  ```

- **Tests 1-a, 1-b, 2 and 3 (Wio)** use per-servo calibrated positions
  instead: a `ZERO` (home) and a `MAX`, found with `1-a-servo-locate`. One
  "dispense" is a full `ZERO -> MAX -> ZERO` sweep for a servo.

## The RFID card data

Tests 2 and 3 write and read their **own** cards (no external writer
needed) on MIFARE Classic blocks `4,5,6,8,9,10` with the default key
`FF FF FF FF FF FF`. Button A/B write these, button C reads them:

```jsonc
{"name":"Matthew","card":{"type":"balance"}}   // A -> joystick selection
{"name":"Alice","card":{"type":"prepaid"}}     // B -> fixed recipe
```

Test 3 additionally sends `{name, type}` to the backend and only dispenses
if it replies `true`. (The archived `3-servero-rfid-wifi-testing-non-used`
instead used the old `backend-full/wio-rfid-writer` payload
`{"user_name":...,"order_number":...}`.)

## Arduino CLI (one-time setup)

```bash
arduino-cli config init
arduino-cli config add board_manager.additional_urls https://files.seeedstudio.com/arduino/package_seeeduino_boards_index.json
arduino-cli core update-index
arduino-cli core install Seeeduino:samd
```

Compile + upload a test (replace the port with yours from
`arduino-cli board list`; on macOS it looks like `/dev/cu.usbmodemXXXX`):

```bash
cd 1-a-servo-locate
arduino-cli compile --fqbn Seeeduino:samd:seeed_wio_terminal .
arduino-cli upload -p /dev/cu.usbmodemXXXX --fqbn Seeeduino:samd:seeed_wio_terminal .
```

The phase-3 Wio sketch also needs the **Seeed Arduino rpcWiFi** library.
Its PC backend is not an Arduino sketch - run it with Node:

```bash
cd 3-backend-wifi-testing
sudo node server.js     # port 80; or: PORT=8080 node server.js
```

## Note on the folder names

The folders start with a digit and use hyphens (for example
`1-a-servo-locate`). Each `.ino` is named identically to its folder, which
is what `arduino-cli` needs. If the Arduino IDE ever complains about the
name, open the `.ino` file directly or rename the folder + sketch
together.

The folder/sketch name `1-b-servo-zero-porint` keeps its original spelling
(`porint`).
