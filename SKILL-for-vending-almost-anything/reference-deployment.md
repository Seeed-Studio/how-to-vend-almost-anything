# Deployment topologies (A–D)

The same three parts (backend, reader Wio, writer Wio) rearrange into four
topologies. Pick from the table in `SKILL.md`, then follow the matching section.
The decision comes down to two questions:

1. **Do you need central stock/balance accounting?** No → **A**. Yes → B/C/D.
2. **Where does the backend live?** Booth PC → **B/C**. Cloud → **D**.
   Writing cards with a second Wio → B/D; over USB from the PC → **C**.

---

## A. MCU-only, offline (no PC, no network)

The whole machine runs on **one Wio Terminal** with no backend. Use the
self-contained sketch `frontend-vending-machine/testing_phase/2-servo-rfid-testing`
(not the official firmware, which requires a backend). One device both writes and
reads cards and dispenses locally.

- **Card A (Matthew, `balance`)** → opens an on-screen dashboard: joystick U/D
  moves the highlight ID1..ID4 → OK → CLEAR, L/R changes each id's `times` 0..9,
  press = click, button A cancels. The customer picks; the servos dispense.
- **Card B (Alice, `prepaid`)** → a fixed recipe compiled into the sketch:

```cpp
const int PREPAID_COUNTS[SERVO_NUM] = {1, 0, 2, 1};   // servo 1 x1, servo 3 x2, servo 4 x1
```

Setup: run `0-servo-set-id` then `1-a`/`1-b` to calibrate, paste `ZERO_POS`/
`MAX_POS` into the sketch, flash it. Buttons A/B write the two demo cards; C reads
a presented card and dispenses.

**Trade-offs:** no central inventory, no money balance, no remote config, no
multi-machine view — the "menu" is the compiled recipe / on-screen counts.

**Change products/parameters in A:**

- *Products / recipe:* edit `PREPAID_COUNTS[]` (fixed card) and the on-screen
  labels/prices in the sketch; there is no product database.
- *Servo travel:* `ZERO_POS`/`MAX_POS` in the sketch (recalibrate with 1-a/1-b).
- *RFID:* same blocks `4,5,6,8,9,10` + key `FF*6`.
- Re-flash to apply any change.

**Upgrade path:** when you later add a PC, keep the same servo calibration
numbers and RFID blocks/key, and switch the machine to the official reader
firmware (topology B).

---

## B. PC-on-LAN (default, recommended for a real booth)

The backend runs on a **booth PC**; the **reader** and **writer** Wios are on the
**same WiFi**. The PC is the brain (inventory, balances, orders, card jobs); the
two Wios are I/O.

1. Start the backend on the PC:

```bash
bash scripts/start_backend.sh            # http://localhost:3000
```

2. Find the PC's LAN IP (`ipconfig` on Windows, `ifconfig | grep "inet "` on
   macOS). It is also shown on the dashboard **Config** page.
3. Configure + flash both Wios (Config page, or edit constants by hand — see
   `reference-firmware.md`):
   - reader `BACKEND_BASE_URL = http://<PC-IP>:3000`, `DEVICE_ID=frontend-1`, `API_KEY=FRONTEND_1_SECRET`
   - writer `API_BASE = http://<PC-IP>:3000`, `DEVICE_ID=wio-rfid-writer`, `API_KEY=WIO_WRITER_SECRET`
4. Load stock on **Inventory**, then issue cards on **Operate** (the writer Wio
   encodes queued jobs when a card is present).

**Requirements:** PC and both Wios on the same subnet; `devices.csv` rows enabled
and matching the sketch credentials.

**Change products/parameters in B:** use the dashboard for runtime changes
(stock, prices, cards) and the `data/*.csv` for definitions (add rows, restart) —
see the product/parameter tables in `SKILL.md` and the schemas in
`reference-backend.md`. Servo/RFID params live in the reader firmware.

---

## C. One-box USB writer (PC does everything, no writer Wio)

Same as B, but the **PC writes cards directly over USB** — you drop the writer
Wio. Only the **reader** Wio remains (on WiFi). Good for an operator desk that
writes cards inline.

1. Install `arduino-cli` and `python3` on the PC (the writer uses
   `scripts/card_io.py`). Connect the writer board (XIAO/Wio) by USB.
2. Start the backend with USB tools enabled:

```bash
LOCAL_DEVICE_TOOLS=1 npm start           # in backend-full/
```

3. Use the synchronous USB endpoints instead of the queued writer flow:
   `POST /api/orders/create-and-write`, `POST /api/cards/topup-and-write`,
   `POST /api/cards/read` (and `POST /api/device/flash`). Configure the board via
   `XIAO_FQBN` / `XIAO_PORT` / `XIAO_SKETCH_DIR` if auto-detect is wrong (see
   `reference-backend.md`).
4. Configure + flash the reader Wio exactly as in B.

**Note:** the USB balance write stores `{user_name,balance,v:1}` on the card,
whereas the WiFi `selecting` flow keeps the balance in `cards.csv`. Pick one
balance model and stay consistent.

---

## D. Cloud backend (Render / Codespaces)

The backend is **hosted**; the reader and writer Wios reach it over the
**internet**. Good for remote/multi-site or when no booth PC is available.

- **Render:** `render.yaml` → rootDir `backend-full`, build `npm install`, start
  `npm start`; health `https://YOUR_URL/api/health`.
- **Codespaces:** `cd backend-full && npm start`, forward port **3000** as
  **Public**, copy the `https://…app.github.dev` URL (see `CODESPACES_SETUP.md`).

Point each Wio's URL at the public host (no trailing slash):

```cpp
const char* BACKEND_BASE_URL = "https://your-app.onrender.com";   // reader
const char* API_BASE         = "https://your-app.onrender.com";   // writer
```

**Persistence caveat (important):** hosted filesystems are ephemeral, so the
`data/*.csv` state (stock, balances, orders) **resets on redeploy/restart**. D is
best for demos and remote dashboards; for durable booth operation use B/C, or add
external persistence. The Codespaces URL only works while the Codespace runs.

**Change products/parameters in D:** same dashboard/CSV workflow as B, but commit
CSV seed changes into the repo (so a fresh deploy starts from them) rather than
relying on runtime edits surviving a restart.

---

## Choosing quickly

| You want… | Topology |
|-----------|----------|
| A demo on a table with no laptop or WiFi | **A** |
| A staffed booth that tracks stock and balances | **B** |
| To write cards at the desk without a second Wio | **C** |
| A dashboard reachable from anywhere / no booth PC | **D** |

Mixing is fine: e.g. a cloud dashboard (D) for monitoring while a booth PC (B)
owns the durable state, or start at A for a demo and move to B once a PC is
available — the servo calibration and RFID blocks/key carry over unchanged.
