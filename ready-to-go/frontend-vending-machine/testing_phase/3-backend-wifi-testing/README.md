# Test 3 backend - `3-backend-wifi-testing`

A tiny, **zero-dependency** Node.js backend that runs on your PC and talks
to [`../3-wio-terminal-wifi-testing/`](../3-wio-terminal-wifi-testing/)
over WiFi. It:

1. prints this PC's IPv4 address(es) on start so you can point the Wio at it,
2. answers `POST /verify` with `true` / `false` for a `{name, type}` card,
3. logs the `POST /report` JSON the Wio sends after it dispenses.

No `npm install` needed - it only uses the built-in `http` / `os` modules.

## Run

The Wio default is `192.168.7.164:80`, so the backend listens on port
**80** by default. Port 80 needs admin rights:

```bash
cd 3-backend-wifi-testing
sudo node server.js
```

No admin? Run on a high port and point the Wio at it instead:

```bash
PORT=8080 node server.js
# then set BACKEND_BASE in the Wio sketch to http://<this-pc-ip>:8080
```

On start it prints something like:

```text
========================================================
 3-backend-wifi-testing   (Wio verify + report backend)
========================================================
 Listening on 0.0.0.0:80
 This PC IPv4 address(es):
   192.168.7.164   (en0)   <-- matches the Wio default
 ...
```

If your PC is **not** `192.168.7.164`, either give it that static IP or
copy one of the printed addresses into the Wio sketch's `BACKEND_BASE`.

## What counts as a valid card

Edit the allow-list at the top of `server.js` (this is how you test the
`false` / "ARORD: Not Matched" path):

```js
const ALLOWED = [
  { name: 'Matthew', type: 'balance' },
  { name: 'Alice',   type: 'prepaid' },
];
```

A card whose `{name, type}` is in the list gets `true`; anything else gets
`false`.

## API

### `POST /verify`

Request body (JSON, sent by the Wio):

```json
{"name":"Matthew","type":"balance"}
```

Response is plain text, exactly `true` or `false`.

### `POST /report`

Request body (JSON, sent by the Wio after it dispenses):

```json
{
  "card_name": "Matthew",
  "card_type": "balance",
  "servo_count": 2,
  "total_rotations": 3,
  "servos": [ {"id": 1, "times": 1}, {"id": 3, "times": 2} ]
}
```

Response is plain text `ok`. The server logs each servo line:

```text
[..] REPORT {"card_name":"Matthew",...}
          - servo 1 rotated 1 time(s)
          - servo 3 rotated 2 time(s)
          servo_count=2  total_rotations=3
```

### `GET /`

Health JSON (also shows the current allow-list), handy from a browser.

## Quick test without the Wio

```bash
curl -s -X POST http://localhost:80/verify \
  -H 'Content-Type: application/json' \
  -d '{"name":"Matthew","type":"balance"}'      # -> true

curl -s -X POST http://localhost:80/verify \
  -H 'Content-Type: application/json' \
  -d '{"name":"Bob","type":"gold"}'             # -> false

curl -s -X POST http://localhost:80/report \
  -H 'Content-Type: application/json' \
  -d '{"card_name":"Alice","card_type":"prepaid","servo_count":3,"total_rotations":4,"servos":[{"id":1,"times":1},{"id":3,"times":2},{"id":4,"times":1}]}'   # -> ok
```

(Use your `PORT` if you changed it.)
