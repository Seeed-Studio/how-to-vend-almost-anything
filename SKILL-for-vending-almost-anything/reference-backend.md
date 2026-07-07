# Backend reference (`backend-full`)

The official backend is `backend-full/src/server.mjs` — an Express server that
stores all state in `backend-full/data/*.csv` and serves the operator dashboard
from `backend-full/public/`. Node 18+.

## Run and environment

```bash
cd backend-full
npm install
npm start                 # node src/server.mjs, http://localhost:3000
```

`npm run start:legacy` runs the old `server.js` (text/form `/machine/*` API on a
different port) — kept for reference only; the official system uses `src/server.mjs`.
Ignore `test_requests.sh` for the official system: it targets the legacy server.

| Env var | Default | Effect |
|---------|---------|--------|
| `PORT` | `3000` | HTTP port. Change every Wio's backend URL to match. |
| `LOCAL_DEVICE_TOOLS` | off | `1`/`true`/`yes` enables USB endpoints (detect/flash/read/write over serial via `arduino-cli` + `python3 scripts/card_io.py`). |
| `ARDUINO_CLI` | `arduino-cli` | Path to the CLI (USB tools). |
| `PYTHON` | `python3` | Python for `card_io.py` (USB tools). |
| `XIAO_FQBN` | `esp32:esp32:XIAO_ESP32C6` | Board for the USB writer flash path. |
| `XIAO_PORT` | auto-detect | Force a serial port for USB tools. |
| `XIAO_SKETCH_DIR` | `../../test-phase/...` | Sketch flashed by `POST /api/device/flash`. |

The two **Wio** setup endpoints (`/api/wio/*`) instead use a fixed
`FQBN Seeeduino:samd:seeed_wio_terminal` and edit the two real sketches in place.

## Data model (`backend-full/data/`)

The canonical/"remote" schemas are intentionally small; extra fields live in side
files joined on the key (`dataMap.mjs` splits/joins them). **Edit the CSVs while
the server is stopped**, then restart — the server rewrites whole files on change.

```text
# inventory.csv        canonical product: identity, column, price
product_id,name,servo_id,stock,price

# product_meta.csv     joined to inventory on product_id (display + selling rules)
product_id,slot_id,low_stock_threshold,max_capacity,active,tag,description,feature_1,feature_2,feature_3,image_path,product_url

# cards.csv            canonical stored-value account (selecting)
card_uid,user_name,mode,balance

# card_meta.csv        joined to cards on card_uid (lifecycle)
card_uid,status,created_at,updated_at,last_payload,notes

# orders.csv           direct orders + selecting checkouts (product_id MULTI or SELECT hold a JSON item array in written_payload)
order_number,user_name,product_id,product_name,quantity,amount_paid,status,rfid_card_uid,written_payload,created_at,written_at,verified_at,dispensed_at,frontend_id,notes

# writer_jobs.csv      queue the writer Wio polls (job_type ORDER | BALANCE)
job_id,order_number,user_name,rfid_payload,rfid_card_uid,status,created_at,claimed_at,written_at,device_id,message,job_type

# devices.csv          credential allow-list for the two Wios (auth)
device_id,device_type,api_key,enabled,notes

# device_status.csv    last heartbeat per device (writer connection, RFID ready, card present)
device_id,device_type,server_connected,rfid_ready,card_present,last_card_uid,current_job_id,last_seen_at,message

# customers.csv        per-user totals
user_name,total_paid,total_orders,last_order_number,created_at,updated_at

# inventory_log.csv    every INIT / REFILL / DISPENSE / DISPENSE_ROLLBACK
time,action,product_id,product_name,quantity_delta,inventory_after,actor,notes

# card_ledger.csv      every TOPUP / SET / PURCHASE / REFUND
time,card_uid,user_name,type,amount,balance_after,actor,notes
```

`devices.csv` ships with `wio-rfid-writer` (writer) and `frontend-1` (reader).
`device_type` gates access: writer endpoints require `writer`, and the reader
uses its `reader` row. Set `enabled=false` to revoke a device.

## Order + stock/balance lifecycle

Stock is **not** reserved when a card is created. It is deducted at the
**authorize** step (the machine asking to dispense), and rolled back on a
reported failure or a cancel. This is why a valid card is still refused when a
column needs a refill at collection time.

```text
direct:    create card (RFID_WRITTEN) → writer encodes card
           → machine verify-card = authorize: check + deduct stock → VERIFIED
           → machine dispenses → dispense-complete(true) → DISPENSED
                                        (false) → DISPENSE_FAILED + stock rolled back
selecting: top-up balance (cards.csv) → writer encodes {type:selecting,user_name}
           → machine verify-card returns balance + per-column arrays
           → customer picks → selecting/checkout: check stock+balance, deduct both,
             create SELECT order (VERIFIED) → dispense → dispense-complete
```

Cancel (`POST /api/orders/:orderNumber/cancel`) refunds stock/balance only if the
order was already `VERIFIED`; a pending/written card never held stock.

## REST API

Base URL `http://<host>:<port>`. Device endpoints need headers
`x-device-id` + `x-api-key` matching an `enabled` row in `devices.csv`.

### Operator / dashboard (no auth headers)

| Method + path | Body | Purpose |
|---------------|------|---------|
| `GET /api/health` | — | `{ok,service,time}` liveness. |
| `GET /api/dashboard` | — | Everything the pages render (metrics, products, orders, cards, devices, logs). |
| `GET /api/products` | — | Products with `needs_refill` / `is_full` / `available` flags. |
| `POST /api/products/:productId/refill` | `{quantity, notes?}` | Add stock, capped at `max_capacity` (`409 over_capacity` if exceeded). |
| `POST /api/inventory/initialize` | `{items:[{product_id,count}]}` | Set exact per-column counts (clamped 0..max). |
| `POST /api/orders/create-and-prepare-card` | `{user_name, product_id, quantity, amount_paid?, rfid_card_uid?}` **or** `{user_name, items:[{product_id,quantity}], amount_paid?}` | Create a `direct` order (single or multi-product) + queue an `ORDER` write job. |
| `POST /api/cards/topup-and-prepare-card` | `{user_name, amount, mode:"add"\|"set", card_uid?}` | Set/add balance in `cards.csv` + queue a `BALANCE` write job. |
| `POST /api/orders/:orderNumber/cancel` | — | Cancel; refunds stock/balance if `VERIFIED`. |

### Writer Wio (`device_type=writer`)

| Method + path | Body | Purpose |
|---------------|------|---------|
| `POST /api/rfid-writer/status` | `{rfid_ready,card_present,last_card_uid,current_job_id,message}` | Heartbeat. |
| `GET /api/rfid-writer/next-job` | — | Claim the next `PENDING` job (`job_type` ORDER/BALANCE). |
| `POST /api/rfid-writer/job-result` | `{job_id,success,rfid_card_uid?,message?}` | Report write result; updates the order. |
| `GET /api/device/writer-status` | — | Writer online (heartbeat <15s) + pending job count (config page). |

### Frontend reader Wio (`device_type=reader`)

| Method + path | Body | Purpose |
|---------------|------|---------|
| `POST /api/frontend/verify-card` | direct: `{type:"direct",user_name,order_number,rfid_card_uid?}`; selecting: `{type:"selecting",user_name,rfid_card_uid?}` | Permission gate. Direct = deduct stock + return per-servo `times[4]`. Selecting = return `balance` + per-column `name\|price\|stock\|needs_refill\|active`. |
| `POST /api/frontend/selecting/checkout` | `{user_name, items:[q1,q2,q3,q4], rfid_card_uid?}` | Validate stock+balance, deduct both, return servo `plan` + `new_balance`. |
| `POST /api/frontend/dispense-complete` | `{order_number, success, notes?}` | Finalize (`DISPENSED`) or roll back on `success:false`. |

`items` for selecting is always a **4-length array indexed by servo id 1..4**.

### Local USB endpoints (only when `LOCAL_DEVICE_TOOLS=1`; else `501`)

`POST /api/orders/create-and-write`, `POST /api/cards/topup-and-write`,
`GET /api/device/status`, `POST /api/device/flash`, `POST /api/cards/read`.
These write cards synchronously over USB instead of via the writer Wio. Note the
USB balance write puts `{user_name,balance,v:1}` on the card, while the WiFi
`selecting` flow keeps the balance in `cards.csv` and writes only `{type:selecting,user_name}`.

### Wio setup / Config page

`GET /api/wio/status` (arduino-cli present? ports, saved config, this PC's LAN
IPs), `POST /api/wio/wifi {target,ssid,password,backend_url}` (writes constants
into the sketch), `POST /api/wio/flash {target,port}` (compile+upload). `target`
is `frontend` or `writer`.

## Hosting

| Target | Recipe | Caveat |
|--------|--------|--------|
| Booth PC / laptop | `bash scripts/start_backend.sh` | Best for durable state; the `data/*.csv` live on disk and persist. |
| Render | `render.yaml`: rootDir `backend-full`, build `npm install`, start `npm start`; health `/api/health` | Ephemeral filesystem — CSV writes reset on redeploy/restart. |
| GitHub Codespaces | `cd backend-full && npm start`, forward port 3000 as **Public** (see `CODESPACES_SETUP.md`) | URL only works while the Codespace runs. |

**Persistence caveat:** on Render/Codespaces the filesystem is ephemeral, so
inventory/balance/order history is not durable across restarts. For a real booth
that must keep stock and balances, run the backend on a PC (topology B/C). Cloud
(D) is best for demos, remote dashboards, or when a booth PC is not available.

`data/*.csv` are committed (only `node_modules/` is git-ignored), so the repo
ships with seed data; back up `data/` before wiping it.
