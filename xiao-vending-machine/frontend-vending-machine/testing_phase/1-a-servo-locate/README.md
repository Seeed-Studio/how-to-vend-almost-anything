# Test 1-a - Servo Locate (find ZERO + MAX)

Interactive helper that runs on the Wio Terminal. Serial servo positions
are `0..4095` over 360 degrees, and after a power cycle the horns can sit
anywhere. This tool lets you drive each of the four servos (IDs `1,2,3,4`)
to the two positions that matter and records them:

- **ZERO** - the home / rest station of that servo.
- **MAX** - the farthest it should ever be allowed to travel.

That is `4 servos x 2 positions = 8 numbers`. The 8 numbers are shown on
the LCD **and** printed on the serial monitor, formatted so you can paste
them straight into [`../1-b-servo-zero-porint/`](../1-b-servo-zero-porint/).

## Controls

| Input | Action |
|-------|--------|
| Button A | select the next servo (`1 -> 2 -> 3 -> 4 -> 1`) |
| Button B | capture the selected servo's current position as **ZERO** |
| Button C | capture the selected servo's current position as **MAX** |
| Joystick Up / Down | jog `+` / `-` **coarse** (`JOG_COARSE`, 50 units) |
| Joystick Right / Left | jog `+` / `-` **fine** (`JOG_FINE`, 5 units) |
| Joystick Press | toggle **JOG** and **HAND** mode (see below) |

`1024 units = 90 degrees`, so a coarse step is ~4.4 deg and a fine step
is ~0.4 deg.

### JOG vs HAND mode

- **JOG** (default): every servo holds its position with torque on, and
  the joystick drives the selected servo. Best for precise, repeatable
  positioning.
- **HAND**: every servo goes limp (torque off) so you can pose the horns
  by hand. When you switch back to JOG, each servo re-holds wherever your
  hand left it. Best for roughly finding a spot quickly.

In **both** modes buttons B / C read the servo's real position, so you can
capture ZERO / MAX no matter how you moved it.

## Typical workflow

1. Upload and open the serial monitor at `115200` baud.
2. Press **A** until the servo you want is selected (marked `>` on the LCD).
3. Jog it (or flip to HAND and push it) to its home station, press **B**.
4. Jog / push it to its farthest allowed point, press **C**.
5. Repeat for all four servos.
6. When all 8 are captured the LCD shows `ALL 8 SET -> serial` and the
   summary block is printed automatically. Copy the two `const` lines
   into `1-b-servo-zero-porint.ino`.

## Wiring

Same serial servo bus as [`../1-servo-testing/`](../1-servo-testing/):
servos daisy-chained on `Serial1` at `1000000` baud, pre-assigned IDs
`1,2,3,4`, powered from an external 6-8V supply with a common GND.

If a servo answers on the bus but refuses to jog, it is usually stuck in
wheel / multi-turn mode. This sketch auto-normalizes each servo to
single-turn position mode with the full `0..4095` range on boot (only
rewriting EEPROM when needed), the same fix as
[`../servo-diagnose/`](../servo-diagnose/).

## Upload

```bash
cd 1-a-servo-locate
arduino-cli compile --fqbn Seeeduino:samd:seeed_wio_terminal .
arduino-cli upload -p /dev/cu.usbmodemXXXX --fqbn Seeeduino:samd:seeed_wio_terminal .
```

## Tuning

Edit the top of `1-a-servo-locate.ino`:

```cpp
const s16 JOG_FINE   = 5;    // fine jog step (Left/Right)
const s16 JOG_COARSE = 50;   // coarse jog step (Up/Down)
const u16 MOVE_SPEED = 2000;
const u8  MOVE_ACC   = 50;
```

## Successful output

LCD (mid-session, servo 2 selected, jogging):

```text
+----------------------------------+
|  SERVO LOCATE                    |
|  --------------------------------|
|   1 Z:2048 M:3072                |
|  >2 Z:2010 M:----                |
|   3 Z:---- M:----                |
|   4 Z:---- M:----                |
|  --------------------------------|
|  JOG   ID 2                      |
|  POS 2665                        |
|  Captured 3/8                    |
|  A:select  B:set ZERO  C:set MAX |
|  Joy U/D coarse   L/R fine       |
|  Press: JOG <-> HAND (limp)      |
+----------------------------------+
```

Serial monitor @ 115200 baud, after the last capture:

```text
[LOCATE] Servo locate tool ready
[LOCATE] ID 1 ZERO=2048
[LOCATE] ID 1 MAX=3072
...
[LOCATE] ===== 8 NUMBERS (ZERO / MAX per servo) =====
[LOCATE] ID 1  ZERO=2048  MAX=3072
[LOCATE] ID 2  ZERO=2010  MAX=3110
[LOCATE] ID 3  ZERO=1990  MAX=3050
[LOCATE] ID 4  ZERO=2048  MAX=3072
[LOCATE] const s16 ZERO_POS[4] = {2048, 2010, 1990, 2048};
[LOCATE] const s16 MAX_POS[4]  = {3072, 3110, 3050, 3072};
[LOCATE] =============================================
```

Copy the two `const` lines into the next test,
[`../1-b-servo-zero-porint/`](../1-b-servo-zero-porint/).
