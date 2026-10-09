# Test 3 - Servo + RFID + WiFi Testing

Everything test 2 does (a matching RFID card triggers the 4-phase servo
sequence), plus: on a matching card the Wio Terminal connects to WiFi and
sends an HTTP `POST` with the body `hello world` to
`http://192.168.120.124/`.

## Configuration

```cpp
const char* WIFI_SSID     = "SEEED-CSG-5G";
const char* WIFI_PASSWORD = "So3C90a#cp32";

const char* MESSAGE_URL  = "http://192.168.120.124/";  // port 80
const char* MESSAGE_BODY = "hello world";

const char* TARGET_USER_NAME    = "Alice";
const char* TARGET_ORDER_NUMBER = "ORD-TEST-0001";
```

WiFi connects at boot. The `hello world` POST is sent when a matching card
is scanned, then the servo sequence runs.

## Receiving the message

Run a listener on `192.168.120.124` (port 80). Any HTTP server works; for
a quick check:

```bash
# Python one-liner HTTP server that prints request bodies
python3 -c "import http.server,socketserver;\
h=http.server.BaseHTTPRequestHandler;\
h.do_POST=lambda s:(print(s.rfile.read(int(s.headers['Content-Length'])).decode()),s.send_response(200),s.end_headers());\
socketserver.TCPServer(('',80),h).serve_forever()"
```

The Wio Terminal itself does not need a specific HTTP status to consider
the test passed; a `2xx`/`3xx` code shows `MESSAGE SENT`, otherwise it
shows `MESSAGE ERROR` with the code and still runs the servos.

## Wiring

Same as test 2 (servos on `Serial1`, Emakefun RFID on the Grove **I2C** port
at `0x28`). On the Wio Terminal that Grove port sits on the `Wire1` bus
(SERCOM4), shared with the onboard accelerometer, so the sketch uses
`Wire1.begin()` and the RFID library is mapped to `Wire1`. No extra wiring for
WiFi - it uses the Wio Terminal's built-in radio.

## Upload

```bash
cd 3-servero-rfid-wifi-testing
arduino-cli compile --fqbn Seeeduino:samd:seeed_wio_terminal .
arduino-cli upload -p /dev/cu.usbmodemXXXX --fqbn Seeeduino:samd:seeed_wio_terminal .
```

## Successful output

Idle / waiting (WiFi already connected):

```text
+----------------------------------+
|  SERVO+RFID+WIFI                  |
|  --------------------------------|
|  Scan the test card              |
|                                  |
|  WiFi: OK                        |
+----------------------------------+
```

After scanning the matching card and sending the message (then the servo
phases play out):

```text
+----------------------------------+
|  MESSAGE SENT                    |
|  --------------------------------|
|  hello world                     |
|                                  |
|  POST 200                        |
|                                  |
|  Moving servos...                |
+----------------------------------+
```

Serial monitor @ 115200 baud:

```text
[TEST] Servo + RFID + WiFi test start
[TEST] Target user_name: Alice
[TEST] Target order_number: ORD-TEST-0001
[WIFI] Connecting to: SEEED-CSG-5G
[WIFI] Connected
[WIFI] IP: 192.168.120.87
[RFID] Reader detected and ready
[RFID] Scanned UID: 17 6C EE EA
[RFID] Payload from card: {"user_name":"Alice","order_number":"ORD-TEST-0001","v":1}
[RFID] user_name: Alice
[RFID] order_number: ORD-TEST-0001
[MATCH] Certain data matched.
[HTTP] POST http://192.168.120.124/
[HTTP] Body: hello world
[HTTP] Code: 200
[PHASE 1/4] Servo 1 -> 90 -> home
[PHASE 2/4] Servos 1-2 -> 90 -> home
[PHASE 3/4] Servos 1-2-3 -> 90 -> home
[PHASE 4/4] Servos 1-2-3-4 -> 90 -> home
```

On the listener you will see the received text:

```text
hello world
```
