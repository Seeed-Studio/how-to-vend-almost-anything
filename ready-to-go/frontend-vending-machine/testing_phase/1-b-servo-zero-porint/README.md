# Test 1-b - Servo Zero Point (home + test max travel)

Consumes the 8 numbers produced by
[`../1-a-servo-locate/`](../1-a-servo-locate/). On boot it drives every
servo (IDs `1,2,3,4`) to its **ZERO** (home) station. From there it can
send them all to **MAX** and verify that each one actually travels the
distance you recorded in test 1-a.

> The folder / sketch name keeps the spelling `1-b-servo-zero-porint`
> (as requested). `arduino-cli` only needs the `.ino` name to match the
> folder name, which it does.

## Set the 8 numbers first

Open `1-b-servo-zero-porint.ino` and paste the two lines that
`1-a-servo-locate` printed on the serial monitor. The sketch currently
holds the values captured on 2026-07-04:

```cpp
// order is servo ID 1, 2, 3, 4
const s16 ZERO_POS[4] = {2490, 2598, 2897, 3651};
const s16 MAX_POS[4]  = {250, 262, 905, 1552};
```

Here every `MAX` is **below** its `ZERO`, which means these servos open
in the decreasing-count direction (roughly 180 deg of travel). That is
fully supported: the sketch commands absolute positions, so direction
does not matter. Re-run `1-a-servo-locate` any time to recapture.

## Controls

| Input | Action |
|-------|--------|
| Button A | move **all** servos to **ZERO** (home) |
| Button B | move **all** servos to **MAX** |
| Button C | run one **sweep test** (`ZERO -> MAX -> ZERO` per servo) |
| Joystick Press | toggle **continuous auto-sweep** on / off |

The sweep test moves each servo to MAX and back, measures how far it
really travelled (via `ReadPos`), and flags it:

- **green** = moved at least half of its intended `MAX - ZERO` span.
- **red** = **NO MOVE** (answered on the bus but did not travel).
- **grey** = servo absent (failed `Ping` on boot).

## Wiring

Same serial servo bus as [`../1-servo-testing/`](../1-servo-testing/):
servos daisy-chained on `Serial1` at `1000000` baud, IDs `1,2,3,4`,
external 6-8V supply with a common GND.

## Upload

```bash
cd 1-b-servo-zero-porint
arduino-cli compile --fqbn Seeeduino:samd:seeed_wio_terminal .
arduino-cli upload -p /dev/cu.usbmodemXXXX --fqbn Seeeduino:samd:seeed_wio_terminal .
```

## Tuning

Edit the top of `1-b-servo-zero-porint.ino`:

```cpp
const u16 MOVE_SPEED     = 2000;
const u8  MOVE_ACC       = 50;
const int SETTLE_TIMEOUT = 3000;  // ms max wait for a move to finish
const int MIN_TRAVEL     = 100;   // min units of motion to count as "moved"
```

Instead of a fixed delay, each move polls `ReadPos` until the servo stops
changing (or `SETTLE_TIMEOUT` elapses), so the big ~180 deg travels here
are timed correctly rather than being read mid-flight.

## Successful output

LCD after a sweep (all four moved, back home at ZERO):

```text
+----------------------------------+
|  SERVO ZERO+MAX                  |
|  --------------------------------|
|  ID  ZERO   MAX    POS           |
|  1   2490   250    2491          |
|  2   2598   262    2599          |
|  3   2897   905    2896          |
|  4   3651   1552   3650          |
|  --------------------------------|
|  ACT:SWEEP            AUTO OFF   |
|  A:home ZERO  B:go MAX  C:sweep  |
|  Press: auto-sweep on/off        |
|  green=moved red=NO MOVE grey=.. |
+----------------------------------+
```

Serial monitor @ 115200 baud:

```text
[ZERO] Servo zero-point tool ready
[ZERO] move ALL -> HOME
[ZERO] ---- sweep test (ZERO->MAX->ZERO) ----
[ZERO] ID 1 zero=2490 max=250 expected=2240 travel=2238  MOVED
[ZERO] ID 2 zero=2598 max=262 expected=2336 travel=2334  MOVED
[ZERO] ID 3 zero=2897 max=905 expected=1992 travel=1990  MOVED
[ZERO] ID 4 zero=3651 max=1552 expected=2099 travel=2097  MOVED
[ZERO] ---- sweep done ----
```

If a servo shows `NO MOVE`, check its ID, power, and that it is in
single-turn position mode (run [`../servo-diagnose/`](../servo-diagnose/)
or re-run [`../1-a-servo-locate/`](../1-a-servo-locate/), which normalizes
the servos on boot).
