# Vending Machine Backend (backend-full)

CSV-backed Node.js backend and operator dashboard for the official XIAO vending
machine. It stores all product and customer data, calculates every dispense and
refill, and drives two Wio Terminals:

- **Frontend Wio** (`frontend-vending-machine/official_frontend_wio_terminal`) - the
  customer-facing reader. Reads the card, asks this backend for permission, drives
  the servos, and reports back so stock/balance is deducted.
- **Backend Wio writer** (`backend-full/wio-rfid-writer`) - encodes the RFID cards.
  It polls this backend for write jobs over WiFi. Flash it once; it then stays
  ready and writes cards on demand (no per-card upload).

```
Operator browser ── Operate / Inventory / Writer Config ─┐
                                                         │  REST + CSV
Backend Wio writer ── poll job / write card / heartbeat ─┼── src/server.mjs :3000 ── data/*.csv
                                                         │
Frontend Wio ── verify-card (permission) / checkout / dispense-complete (deduct)
```

## Selling types

The RFID card carries a `type` written by the backend Wio writer:

- `direct` - `{"type":"direct","user_name":"..","order_number":"..","v":1}`
  A pre-created order for a specific product. The machine dispenses it after the
  backend approves. Stock is deducted at collection time, so a valid card will
  still be refused if the column needs a refill.
- `selecting` - `{"type":"selecting","user_name":"..","v":1}`
  A stored-value balance card. The customer picks products on the Wio screen; the
  backend checks stock + balance, deducts `price x quantity`, and returns the
  servo plan. The money balance lives here in `cards.csv`, not on the card.

## Capacity / refill

Each column is 26 cm tall and one product is 2.2 cm, so a column holds at most
**10** products (`max_capacity` in `product_meta.csv`). The dashboard alerts when
a column is `full` (at max) or `needs_refill` (at/below `low_stock_threshold`),
and the frontend stops dispensing from a column that cannot fulfill the request.

## Data files (`data/`)

- `inventory.csv` - `product_id,name,servo_id,stock,price` (canonical)
- `product_meta.csv` - `product_id,slot_id,low_stock_threshold,max_capacity,active,...`
- `cards.csv` / `card_meta.csv` - stored-value balance accounts (selecting)
- `card_ledger.csv` - TOPUP / SET / PURCHASE / REFUND history
- `orders.csv` - direct orders + selecting checkouts (`product_id=SELECT`)
- `customers.csv`, `inventory_log.csv`, `writer_jobs.csv`, `device_status.csv`, `devices.csv`

## Install & run

```bash
npm install
npm start          # src/server.mjs on http://localhost:3000
```

Open `http://localhost:3000`. Pages:

- **Operate** (`/index.html`) - write a direct order or a selecting balance card
  (queues a job for the Wio writer), plus live metrics and refill alerts.
- **Inventory** (`/inventory.html`) - initialize each column's current count and
  refill up to the max, with capacity bars and FULL / REFILL badges.
- **Writer Config** (`/config.html`) - confirm the backend Wio writer is
  connected (heartbeat) and see the exact firmware constants to hardcode.

Find your LAN IP for the Wio Terminals: `ipconfig` (Windows) or
`ifconfig | grep "inet "` (macOS). Use `http://YOUR_IP:3000` (no trailing slash).

## API (src/server.mjs)

Operator / dashboard:

- `GET  /api/dashboard` - everything the pages render
- `GET  /api/products` - products with capacity flags
- `POST /api/products/:productId/refill` - add stock, capped at `max_capacity`
- `POST /api/inventory/initialize` - set exact per-column counts `{items:[{product_id,count}]}`
- `POST /api/orders/create-and-prepare-card` - create a `direct` order + queue an ORDER write job
- `POST /api/cards/topup-and-prepare-card` - set/add balance + queue a BALANCE write job
- `POST /api/orders/:orderNumber/cancel`

Backend Wio writer (headers `x-device-id`, `x-api-key`):

- `POST /api/rfid-writer/status` - heartbeat
- `GET  /api/rfid-writer/next-job` - claims the next PENDING job (returns `job_type`)
- `POST /api/rfid-writer/job-result`
- `GET  /api/device/writer-status` - writer connection summary for the config page

Frontend Wio (headers `x-device-id`, `x-api-key`):

- `POST /api/frontend/verify-card` - permission gate; `type: direct | selecting`
- `POST /api/frontend/selecting/checkout` - `{user_name, items:[q1,q2,q3,q4]}`; spends balance + stock, returns servo plan
- `POST /api/frontend/dispense-complete` - `{order_number, success}`; finalizes, or rolls stock/balance back on failure

Registered devices live in `data/devices.csv` (`frontend-1` reader,
`wio-rfid-writer` writer). Cards are written across MIFARE Classic 1K blocks
4,5,6,8,9,10 with key `FF FF FF FF FF FF`.

## Legacy server

`server.js` is the older text/`form`-based API (`/machine/*`, `/admin/data`) kept
for reference. Run it with `npm run start:legacy`. The official system uses
`src/server.mjs`.
