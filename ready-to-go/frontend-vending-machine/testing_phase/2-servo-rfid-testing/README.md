# Test 2 - Servo + RFID (write / read / dispense)

A small RFID write + read station on the Wio Terminal, wired to the serial
servos. On boot every servo returns to its **ZERO** station (the values
found with [`../1-a-servo-locate/`](../1-a-servo-locate/) and
[`../1-b-servo-zero-porint/`](../1-b-servo-zero-porint/)). Then:

| Button | Action |
|--------|--------|
| A | **write** a `Matthew` (balance) card |
| B | **write** an `Alice` (prepaid) card |
| C | **read** the card and dispense |

After pressing a button, present a card to the reader (the joystick press
cancels the wait).

## What gets written

Compact JSON, stored across MIFARE Classic blocks `4,5,6,8,9,10` with key
`FF FF FF FF FF FF`:

```jsonc
// Button A
{"name":"Matthew","card":{"type":"balance"}}
// Button B
{"name":"Alice","card":{"type":"prepaid"}}
```

## What happens on read (button C)

One "dispense" of a servo is a **full** actuation: `ZERO -> MAX -> ZERO`.
Each leg waits until the servo actually arrives (within `ARRIVE_TOL`), so
every rotation travels the whole way from the zero point to the maximum
position - it never stops a little bit short. For N times, it repeats the
full ZERO -> MAX -> ZERO sweep N times.

- **Alice / prepaid** - fixed order, `servo 1 x1, servo 3 x2, servo 4 x1`:

```cpp
// index = servo id 1,2,3,4
const int PREPAID_COUNTS[SERVO_NUM] = {1, 0, 2, 1};
```

- **Matthew / balance** - opens a dashboard showing all four servo ids at
  once, each with its own `times`, plus on-screen **OK** and **CLEAR**
  buttons:

```text
Joystick Up / Down    : move the highlight (ID1..ID4 -> OK -> CLEAR)
Joystick Left / Right : change the highlighted ID's times (0..9)
Joystick Press        : "click" the highlighted item
                          - on an ID : add one rotation (+1 time)
                          - on OK    : rotate every selected id (times>0)
                          - on CLEAR : reset all times to 0
Button A              : cancel / back
```

  An id with `times > 0` is "selected" (shown green). Pressing **OK**
  rotates each selected id its number of times (full sweeps); **CLEAR**
  resets every id to 0.

- Any other card shows `UNKNOWN CARD` and nothing moves.

## Positions (from 1-a / 1-b)

```cpp
// servo id 1,2,3,4
const s16 ZERO_POS[SERVO_NUM] = {2490, 2598, 2897, 3651};
const s16 MAX_POS[SERVO_NUM]  = {250, 262, 905, 1552};
```

Keep these in sync with `1-b-servo-zero-porint`; re-run `1-a` to recapture.

## Wiring

```text
Serial bus servos (IDs 1-4)      Wio Terminal
  Signal / bus  --------------->  Serial1 UART (40-pin header TX/RX)
  GND           --------------->  GND
  V+            --------------->  external servo supply

Emakefun MFRC522 RFID (0x28)     Wio Terminal
  SDA           --------------->  Grove I2C SDA (Wire1)
  SCL           --------------->  Grove I2C SCL (Wire1)
  5V            --------------->  5V
  GND           --------------->  GND
```

Use the Grove **I2C** port (on `Wire1`, SERCOM4, shared with the onboard
accelerometer). RFID is initialized at boot; if the reader is not detected
the screen shows "RFID not ready" - press button A to retry.

Cards must be blank/default **MIFARE Classic** (keys `FF FF FF FF FF FF`)
so the sketch can write with Key A.

## Upload

```bash
cd 2-servo-rfid-testing
arduino-cli compile --fqbn Seeeduino:samd:seeed_wio_terminal .
arduino-cli upload -p /dev/cu.usbmodemXXXX --fqbn Seeeduino:samd:seeed_wio_terminal .
```

## Successful output

Idle:

```text
+----------------------------------+
|  SERVO+RFID                      |
|  --------------------------------|
|  A: write Matthew                |
|  B: write Alice                  |
|  C: read + dispense              |
|  Servos homed to ZERO.           |
|  Press a button, then present... |
+----------------------------------+
```

Serial monitor @ 115200 baud (write Alice, then read it):

```text
[TEST] Servo + RFID write/read station start
[TEST] A=write Matthew  B=write Alice  C=read+dispense
[RFID] Version register: 0x92
[RFID] Reader detected and ready
[RFID] Writing Alice to UID: 17 6C EE EA
[RFID] Wrote payload: {"name":"Alice","card":{"type":"prepaid"}}
[RFID] Scanned UID: 17 6C EE EA
[RFID] Payload from card: {"name":"Alice","card":{"type":"prepaid"}}
[RFID] name=Alice  type=prepaid
[PREPAID] Alice card -> fixed recipe
[DISPENSE] Alice servo 1 move 1/1
[DISPENSE] Alice servo 3 move 1/2
[DISPENSE] Alice servo 3 move 2/2
[DISPENSE] Alice servo 4 move 1/1
```

Reading a Matthew card instead opens the selection dashboard:

```text
+----------------------------------+
|  MATTHEW SELECT                  |
|  --------------------------------|
| >ID 1        times: 1            |
|  ID 2        times: 0            |
|  ID 3        times: 2            |
|  ID 4        times: 0            |
|  --------------------------------|
|  [  OK  ]      [ CLEAR ]         |
|  Joy U/D move  L/R times  Press  |
+----------------------------------+
```

Selecting id1 x1 and id3 x2, then clicking OK:

```text
[RFID] name=Matthew  type=balance
[BALANCE] Matthew OK -> id1x1 id3x2
[DISPENSE] Matthew servo 1 move 1/1
[DISPENSE] Matthew servo 3 move 1/2
[DISPENSE] Matthew servo 3 move 2/2
```
