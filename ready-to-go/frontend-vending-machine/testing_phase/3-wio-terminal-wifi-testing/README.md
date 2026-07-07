# Test 3 Wio - `3-wio-terminal-wifi-testing`

An enhanced [`../2-servo-rfid-testing/`](../2-servo-rfid-testing/): same
write / read / dispense station, but every **read** is now gated by the
backend [`../3-backend-wifi-testing/`](../3-backend-wifi-testing/) over
WiFi, and the Wio reports what it dispensed back to the backend.

| Button | Action |
|--------|--------|
| A | **write** a `Matthew` (balance) card |
| B | **write** an `Alice` (prepaid) card |
| C | **read** the card, verify with the backend, then dispense |

## Read flow (button C)

```text
read {name,type} from card
   -> POST /verify {name,type}  to the backend
        "true"  -> Matthew/balance : selection dashboard
                   Alice/prepaid   : dispense fixed recipe directly
                   (after dispensing) -> POST /report  {servos, counts}
        "false" -> show "ARORD: Not Matched", back to the start screen
        no reply/offline -> show "BACKEND ERROR", back to the start screen
```

Everything is also logged over serial (`[RFID]`, `[WIFI]`, `[HTTP]`,
`[DISPENSE]`, `[REPORT]`).

- **Alice / prepaid** dispenses the fixed recipe `servo 1 x1, servo 3 x2,
  servo 4 x1` (`PREPAID_COUNTS`).
- **Matthew / balance** opens the dashboard: all four ids with their own
  `times`, plus on-screen **OK** / **CLEAR** (joystick U/D move, L/R times,
  press = click, A = cancel).

One "dispense" of a servo is a full `ZERO -> MAX -> ZERO` sweep using the
positions from `1-a` / `1-b`.

## The report (requirement 3)

After a successful dispense the Wio POSTs JSON to `/report`:

```json
{
  "card_name": "Matthew",
  "card_type": "balance",
  "servo_count": 2,
  "total_rotations": 3,
  "servos": [ {"id": 1, "times": 1}, {"id": 3, "times": 2} ]
}
```

`servo_count` = how many ids rotated; `total_rotations` = total sweeps.

## Configure before uploading

At the top of `3-wio-terminal-wifi-testing.ino`:

```cpp
const char* WIFI_SSID     = "SEEED-MKT";
const char* WIFI_PASSWORD = "edgemaker2023";

// Backend default 192.168.7.164:80 (port 80 is the http default).
// Change to the IP the backend prints if your PC uses a different one.
const char* BACKEND_BASE  = "http://192.168.7.164";
```

The servo `ZERO_POS` / `MAX_POS` arrays are carried over from `1-a` / `1-b`
- keep them in sync.

## Wiring

Same as test 2 (serial servos on `Serial1`, Emakefun MFRC522 on the Grove
I2C / `Wire1` at `0x28`) plus the Wio Terminal's built-in WiFi. Cards must
be blank/default **MIFARE Classic** (keys `FF FF FF FF FF FF`).

## Upload

```bash
cd 3-wio-terminal-wifi-testing
arduino-cli compile --fqbn Seeeduino:samd:seeed_wio_terminal .
arduino-cli upload -p /dev/cu.usbmodemXXXX --fqbn Seeeduino:samd:seeed_wio_terminal .
```

Requires the **Seeed Arduino rpcWiFi** library (already used by the older
`3-servero-rfid-wifi-testing-non-used`).

## Run order

1. On the PC: start [`../3-backend-wifi-testing/`](../3-backend-wifi-testing/)
   (`sudo node server.js`) and note the printed IP.
2. Make sure `BACKEND_BASE` matches that IP, then upload this sketch.
3. Write a card (A or B), then read it (C) and watch the backend terminal
   log the verify + report.

## Successful output

Idle:

```text
+----------------------------------+
|  RFID+WIFI                       |
|  --------------------------------|
|  A: write Matthew                |
|  B: write Alice                  |
|  C: read + verify                |
|  WiFi: connected 192.168.120.50  |
|  Backend: http://192.168.7.164    |
+----------------------------------+
```

Serial (read an Alice card, backend approves):

```text
[RFID] name=Alice  type=prepaid
[HTTP] POST http://192.168.7.164/verify  body={"name":"Alice","type":"prepaid"}
[HTTP] /verify code=200 resp=true
[PREPAID] Alice card -> fixed recipe
[DISPENSE] Alice servo 1 move 1/1
[DISPENSE] Alice servo 3 move 1/2
[DISPENSE] Alice servo 3 move 2/2
[DISPENSE] Alice servo 4 move 1/1
[REPORT] {"card_name":"Alice","card_type":"prepaid","servo_count":3,"total_rotations":4,"servos":[{"id":1,"times":1},{"id":3,"times":2},{"id":4,"times":1}]}
[HTTP] /report code=200 resp=ok
```

Serial (backend rejects the card):

```text
[HTTP] /verify code=200 resp=false
[VERIFY] ARORD: Not Matched -> Matthew / balance
```

and the LCD shows `ARORD: Not Matched` before returning to the start
screen.

> Note: `ARORD: Not Matched` is shown verbatim as requested (looks like a
> typo for `ERROR`); change the string in `showNotMatched()` if you want.
