# Test 1 - Servo Testing

Uploads to the Wio Terminal and continuously exercises the four serial
servos on the `Serial1` bus. It runs four phases in a loop, each about 2
seconds, and shows the current phase on the LCD.

```
Phase 1: servo 1              -> +90 deg -> back
Phase 2: servos 1,2           -> +90 deg -> back
Phase 3: servos 1,2,3         -> +90 deg -> back
Phase 4: servos 1,2,3,4       -> +90 deg -> back
```

## Wiring

```text
Serial bus servos (IDs 1-4)      Wio Terminal
  Signal / bus  --------------->  Serial1 UART (40-pin header TX/RX)
  GND           --------------->  GND
  V+            --------------->  external servo supply (6-8V typical)
```

Servos are daisy-chained on the bus and must be pre-assigned IDs `1,2,3,4`.
The bus runs at `1000000` baud (set in `setup()`), matching the reader in
`../../wio_backend_full_reader/`.

## Upload

```bash
cd 1-servo-testing
arduino-cli compile --fqbn Seeeduino:samd:seeed_wio_terminal .
arduino-cli upload -p /dev/cu.usbmodemXXXX --fqbn Seeeduino:samd:seeed_wio_terminal .
```

## Tuning

Edit the top of `1-servo-testing.ino` if needed:

```cpp
const s16 POS_HOME   = 2048;  // resting position
const s16 POS_90     = 3072;  // +90 deg (POS_HOME + 1024)
const u16 MOVE_SPEED = 2000;
const u8  MOVE_ACC   = 50;
```

## Successful output

LCD (cycling through the phases, here showing phase 4):

```text
+----------------------------------+
|  SERVO TEST                      |
|  --------------------------------|
|  Phase 4/4                       |
|                                  |
|  Servos 1-2-3-4                  |
|                                  |
|  90 deg + back                   |
+----------------------------------+
```

Serial monitor @ 115200 baud:

```text
[TEST] Servo test start
[PHASE 1/4] Servo 1 -> 90 -> home
[PHASE 2/4] Servos 1-2 -> 90 -> home
[PHASE 3/4] Servos 1-2-3 -> 90 -> home
[PHASE 4/4] Servos 1-2-3-4 -> 90 -> home
[TEST] Cycle complete
[PHASE 1/4] Servo 1 -> 90 -> home
...
```

You should see each servo swing 90 degrees and return, with one more
servo joining every phase, then the whole cycle repeats.
