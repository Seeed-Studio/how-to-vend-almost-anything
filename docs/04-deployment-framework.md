# Layer 4 — Deployment Framework

*From system to replication.*

A system becomes meaningful when it can be reproduced. This layer is about lowering the cost of that reproduction to as close to zero as possible, so that any local Fab Lab can stand up its own machine without deep customization.

The guiding principle is **replication through clarity, not complexity**. The system is delivered as a kit, not as a one-off project.

## What a complete deployment kit contains

- A complete **bill of materials**.
- **Wiring and mechanical assembly** instructions.
- A **firmware and backend setup** guide.
- **Configuration templates** for different use cases.
- **Maintenance and troubleshooting** documentation.

## How this repository delivers it

The deployable system is intentionally small — three folders that can be copied to any booth PC:

| Component | Location | Purpose |
| --- | --- | --- |
| Backend + dashboard | [`xiao-vending-machine/backend-full/`](../xiao-vending-machine/backend-full) | CSV-backed Node.js server and the Operate / Inventory / Config pages |
| Device firmware | [`xiao-vending-machine/frontend-vending-machine/`](../xiao-vending-machine/frontend-vending-machine) | The customer-facing reader, plus step-by-step bring-up sketches |
| Run helper | [`xiao-vending-machine/scripts/start_backend.sh`](../xiao-vending-machine/scripts/start_backend.sh) | Installs dependencies and starts the server anywhere |

Start the backend on any PC:

```bash
bash xiao-vending-machine/scripts/start_backend.sh
```

This installs dependencies and serves the dashboard at `http://localhost:3000`, exposing three operator pages:

- **Operate** — write a direct-order card or a stored-value balance card.
- **Inventory** — initialize and refill each column (up to its capacity).
- **Config** — set each Wio Terminal's WiFi and backend URL, then flash it over USB.

### Bring-up as a guided path

Replication is not only "copy and run." The [`testing_phase/`](../xiao-vending-machine/frontend-vending-machine/testing_phase) sketches turn hardware bring-up into an ordered, verifiable path — servo calibration (`1-a`, `1-b`), RFID (`2`), then WiFi and backend integration (`3`). Each step builds on the previous one and proves one thing works before the next is added.

### Hosting options

- **Local**, on the booth PC, via the run helper above.
- **Render**, using [`xiao-vending-machine/render.yaml`](../xiao-vending-machine/render.yaml) (`rootDir: backend-full`, `npm install`, `npm start`).
- **GitHub Codespaces**, following [`CODESPACES_SETUP.md`](../xiao-vending-machine/CODESPACES_SETUP.md).

## The outcome

When bring-up is a checklist, configuration is a template, and hosting is a one-liner, the machine stops being a bespoke build and becomes something a lab can reproduce with confidence. That reproducibility is the precondition for the final layer: many machines, in many places, forming a network.
