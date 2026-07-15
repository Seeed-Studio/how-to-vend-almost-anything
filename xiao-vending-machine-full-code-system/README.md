# Seeed XIAO Vending System

The real, deployable system is just **three folders**. Copy these to the booth PC
and you have everything:

```text
backend-full/             CSV-backed Node.js backend + operator dashboard (Operate / Inventory / Config)
frontend-vending-machine/ Wio Terminal firmware
    official_frontend_wio_terminal/   the customer-facing reader that dispenses (upload to the frontend Wio)
    testing_phase/                    step-by-step bring-up sketches (servo calibration, RFID, WiFi tests)
scripts/                  install + run helper (start_backend.sh)
```

The backend also contains the second Wio firmware:

```text
backend-full/wio-rfid-writer/   the RFID writer firmware (upload to the backend Wio; writes the cards)
```

Everything not needed to run the real machine lives in
`non-related-to-the-real-scenario/` (older `wio_backend_full_reader`, the XIAO
`test-phase` bring-up kit, and the standalone `rfid-write-station`). It is kept
for reference only and is not required to deploy.

## Run the backend (any PC)

Copy the three folders, then:

```bash
bash scripts/start_backend.sh
```

That installs dependencies and starts the server on <http://localhost:3000>.
Open it and use the three pages:

- **Operate** - write a direct order card (single or multi-product) or a selecting balance card.
- **Inventory** - initialize / refill each column (max 10 per column).
- **Config** - set each Wio Terminal's WiFi + backend URL and flash it over USB (needs `arduino-cli`).

## The two Wio Terminals

| Role | Firmware | What it does |
|------|----------|--------------|
| Frontend reader | `frontend-vending-machine/official_frontend_wio_terminal` | Reads the card, asks the backend for permission, dispenses via the servos, reports back. |
| Backend writer | `backend-full/wio-rfid-writer` | Polls the backend for write jobs and encodes RFID cards. |

Both connect to the backend over WiFi and must be on the **same network** as the
PC running the backend. The Config page detects the PC's LAN IP, flags a network
mismatch, and flashes each Wio with one click.

## Card types

- **direct** - the operator pre-selects the exact product(s) + quantities; the machine dispenses them after backend approval.
- **selecting** - a stored-value balance card; the customer picks products on the Wio screen, spending the backend-tracked balance.

Stock is deducted at collection time, so a valid card is still refused if a
column needs a refill.

## Real operation (reference)

End-to-end recordings of the finished machine running the official firmware and backend. Click a still to open the full video.

### Direct-order dispense

A pre-written **direct** card is tapped; the machine dispenses the queued products in one pass.

[![Direct-order dispense](../docs/assets/real-operation-order-dispense.jpg)](../docs/assets/real-operation-order-dispense.mp4)

[Full recording (MP4)](../docs/assets/real-operation-order-dispense.mp4)

### Balance / selecting dispense

A **selecting** balance card is tapped; the customer picks products on the Wio Terminal until the balance is spent.

[![Balance dispense](../docs/assets/real-operation-balance-dispense.jpg)](../docs/assets/real-operation-balance-dispense.mp4)

[Full recording (MP4)](../docs/assets/real-operation-balance-dispense.mp4)

## Backend deployment on Render (optional)

```text
Root Directory: backend-full
Build Command: npm install
Start Command: npm start
```

Health check: `https://YOUR_RENDER_URL/api/health`. See `CODESPACES_SETUP.md`
for running it in GitHub Codespaces.
