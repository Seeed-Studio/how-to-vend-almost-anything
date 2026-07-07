---
name: vending-almost-anything
description: >-
  Operate, deploy, configure, and modify the open-source XIAO / Wio Terminal
  vending machine in xiao-vending-machine-full-code-system. The system is a
  CSV-backed Node.js backend (the "brain", normally on a PC) plus two Wio
  Terminal firmwares: a frontend reader that dispenses and a backend RFID writer
  that encodes cards. Use when running or hosting the backend (local PC, Render,
  Codespaces, or USB-writer mode), flashing/configuring the Wio Terminals (WiFi,
  backend URL, device keys), choosing a deployment topology (MCU-only offline,
  PC-on-LAN, cloud, or one-box USB writer), adding/removing products or changing
  prices/servo mapping/stock/capacity, recalibrating servos, or debugging the
  card verify / checkout / dispense flow.
disable-model-invocation: true
---

# Vending Almost Anything

The reference system that lets a Fab Lab "vend almost anything". It is a small
set of parts you can rearrange for different deployments; this skill is the map
for running it, deploying it in any topology, and changing what it sells.

## Where the code lives

Everything is under `xiao-vending-machine-full-code-system/` (the "code system"):

```text
backend-full/                              CSV-backed Node.js backend + operator dashboard (the brain)
  src/server.mjs                             the official API + static dashboard, port 3000
  data/*.csv                                 products, cards, orders, inventory, devices (the state)
  public/                                    Operate / Inventory / Config dashboard pages
  wio-rfid-writer/wio_rfid_writer/           firmware for the backend RFID WRITER Wio
  scripts/card_io.py                         USB serial card read/write (LOCAL_DEVICE_TOOLS mode)
frontend-vending-machine/
  official_frontend_wio_terminal/            firmware for the customer-facing READER Wio (dispenses)
  testing_phase/                             bring-up sketches + the offline MCU-only sketch (phase 2)
scripts/start_backend.sh                     install deps + start the backend from anywhere
render.yaml / CODESPACES_SETUP.md            one-click cloud hosting recipes
```

## The three parts

| Part | Where it usually runs | Job |
|------|----------------------|-----|
| **Backend** (`backend-full`) | a PC (or cloud) | Holds all state in `data/*.csv`; decides every dispense, refill, balance. |
| **Frontend reader** (`official_frontend_wio_terminal`) | Wio Terminal in the machine | Reads a card, asks the backend for permission, drives the 4 servos, reports back. |
| **Backend writer** (`wio-rfid-writer`) | Wio Terminal at the operator desk | Polls the backend for write jobs and encodes RFID cards. |

Two **card types** (the `type` is written onto the card by the writer):

- **direct** — an operator pre-picks the exact product(s) + quantity; the machine
  dispenses after backend approval. `{"type":"direct","user_name":..,"order_number":..,"v":1}`
- **selecting** — a stored-value balance card; the customer picks products on the
  Wio screen. Balance lives in `cards.csv`, not on the card.
  `{"type":"selecting","user_name":..,"v":1}`

## Step 1 — pick a deployment topology

The same parts snap together four ways. Choose one, then follow its column.
Full walkthroughs are in [reference-deployment.md](reference-deployment.md).

| Topology | Backend | MCUs | Network | Tracks stock/balance? | Use when |
|----------|---------|------|---------|----------------------|----------|
| **A. MCU-only (offline)** | none | 1 reader Wio | none | No (card carries the recipe) | Demo, no PC, no WiFi, simplest possible |
| **B. PC-on-LAN (default)** | booth PC :3000 | reader + writer Wio | same WiFi | Yes | Real booth with a laptop present |
| **C. One-box USB writer** | booth PC :3000 (`LOCAL_DEVICE_TOOLS=1`) | reader Wio only | reader on WiFi; cards written over USB | Yes | Operator desk writes cards without a second Wio |
| **D. Cloud backend** | Render / Codespaces | reader + writer Wio | internet | Yes, but state is ephemeral | Remote/multi-site; hosted dashboard |

> The **official firmware requires a backend** (B/C/D). Topology **A** is a
> different, self-contained sketch (`testing_phase/2-servo-rfid-testing`) that
> dispenses a fixed recipe with no network — see reference-deployment.md.

## Step 2 — run the backend (topologies B / C / D)

From the code-system root (copy `backend-full`, `frontend-vending-machine`, and
`scripts` together, then):

```bash
bash scripts/start_backend.sh          # installs deps, serves http://localhost:3000
# or:
cd backend-full && npm install && npm start
```

Open `http://localhost:3000` for the three dashboard pages: **Operate**,
**Inventory**, **Config**. Health check: `GET /api/health`.

Common environment switches (details in [reference-backend.md](reference-backend.md)):

| Variable | Effect |
|----------|--------|
| `PORT` | Serve on a port other than 3000 (also update each Wio's backend URL). |
| `LOCAL_DEVICE_TOOLS=1` | Enable USB card writing/flashing from the dashboard (topology C). |

## Step 3 — configure and flash the Wio Terminals

Both Wios must reach the backend and present matching credentials. Two ways:

**From the dashboard (Config page, easiest).** With `arduino-cli` installed and a
Wio on USB, the Config page detects the PC's LAN IP, writes WiFi + backend URL
into the sketch, flags a network mismatch, and flashes with one click.
(`POST /api/wio/wifi`, `POST /api/wio/flash`; `target` is `frontend` or `writer`.)

**By hand,** edit the constants at the top of each sketch, then compile/upload
with `arduino-cli` (`FQBN Seeeduino:samd:seeed_wio_terminal`). The config points:

| Sketch | Constants to set |
|--------|------------------|
| `official_frontend_wio_terminal.ino` (reader) | `WIFI_SSID`, `WIFI_PASSWORD`, `BACKEND_BASE_URL` (no trailing slash), `DEVICE_ID="frontend-1"`, `API_KEY="FRONTEND_1_SECRET"` |
| `wio_rfid_writer.ino` (writer) | `WIFI_SSID`, `WIFI_PASSWORD`, `API_BASE` (note: not `BACKEND_BASE_URL`), `DEVICE_ID="wio-rfid-writer"`, `API_KEY="WIO_WRITER_SECRET"` |

Each Wio's `DEVICE_ID`/`API_KEY` must match an `enabled=true` row in
`backend-full/data/devices.csv`, or every request is rejected with `401`. Build,
flash, and calibration commands are in [reference-firmware.md](reference-firmware.md).

## Change what it sells (products)

Products map **1 product → 1 servo → 1 physical column**, servo ids `1..4` (four
columns). Two ways to change them:

- **Dashboard (runtime):** *Inventory* sets exact per-column counts and refills
  (cap 10); *Operate* writes order/balance cards and shows alerts. No restart.
- **CSV (definition):** edit `backend-full/data/` and restart the backend.
  `inventory.csv` is canonical; `product_meta.csv` holds the extra fields:

```text
# inventory.csv  (canonical: what & where & price)
product_id,name,servo_id,stock,price
P001,XIAO ESP32-S3 Sense,1,0,15.99

# product_meta.csv  (display + rules, joined on product_id)
product_id,slot_id,low_stock_threshold,max_capacity,active,tag,description,feature_1,feature_2,feature_3,image_path,product_url
P001,A1,3,10,true,Vision + Voice AI,...,...,...,...,/assets/products/xiao-esp32-s3-sense.png,https://...
```

**Keep these in sync (the invariants that break dispensing if ignored):**

- `servo_id` must be a unique value in **1..4**. The on-screen *selecting* menu
  and the dispense plan are indexed by servo id 1..4 — a product on servo 5, or
  two products sharing a servo, will not appear/behave correctly.
- Physical column order must match `servo_id` (product on servo 2 sits in the
  column driven by servo id 2).
- `max_capacity` (default 10) is the mechanical column limit; refills are capped
  to it. `low_stock_threshold` drives the refill/`needs_refill` alerts.
- `active=false` hides a product from selling without deleting its history.

Full CSV schema for all files (orders, cards, ledger, devices, logs) is in
[reference-backend.md](reference-backend.md).

## Change the parameters

| Parameter | Where | Notes |
|-----------|-------|-------|
| Servo travel (home/open) | `ZERO_POS[4]` / `MAX_POS[4]` in the reader `.ino` | Re-capture with `testing_phase/1-a`+`1-b`; one dispense = ZERO→MAX→ZERO. |
| Servo count / ids | `SERVO_NUM`, `ID[]` in the reader `.ino` | Bound to 4 columns; changing this ripples into the backend's 1..4 arrays. |
| WiFi / backend URL | sketch constants or Config page | URL has **no trailing slash**; `localhost` on a Wio means the Wio itself. |
| Device credentials | `devices.csv` + sketch `DEVICE_ID`/`API_KEY` | Must match; `enabled=true`. |
| Capacity / low-stock | `max_capacity` / `low_stock_threshold` in `product_meta.csv` | |
| Prices | `price` in `inventory.csv` (or dashboard) | Used for selecting-card checkout math. |
| RFID key / data blocks | `DATA_BLOCKS {4,5,6,8,9,10}`, key `FF*6` in **both** sketches | Writer and reader must agree, or reads fail. |
| Backend port | `PORT` env | Update every Wio's backend URL to match. |

## Smoke test the backend (no hardware)

```bash
curl -s http://localhost:3000/api/health
curl -s http://localhost:3000/api/products
# frontend device call needs the matching headers:
curl -s -X POST http://localhost:3000/api/frontend/verify-card \
  -H 'Content-Type: application/json' \
  -H 'x-device-id: frontend-1' -H 'x-api-key: FRONTEND_1_SECRET' \
  -d '{"type":"selecting","user_name":"Alice"}'
```

More scripted checks and the full request/response contract are in
[reference-backend.md](reference-backend.md).

## Reference files

- [reference-backend.md](reference-backend.md) — run/env, complete REST API, every
  CSV schema, the order + stock/balance lifecycle, and hosting (LAN / Render /
  Codespaces / USB) with the persistence caveat.
- [reference-firmware.md](reference-firmware.md) — the two Wio firmwares in detail,
  servo calibration workflow + numbers, RFID payload/blocks/key, build & flash,
  controls, and hardware troubleshooting.
- [reference-deployment.md](reference-deployment.md) — the four topologies A–D end
  to end, including the offline MCU-only sketch, and how changing products /
  parameters differs per topology.
```