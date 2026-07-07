# Layer 4 — Deployment Framework

*From system to replication.*

A system becomes meaningful when it can be reproduced. This layer is about lowering the cost of that reproduction to as close to zero as possible, so that any local Fab Lab can stand up its own machine without deep customization.

The guiding principle is **replication through clarity, not complexity**. The system is delivered as a kit, not as a one-off project.

This is only affordable because the reference machine is **open source and modular** (see [Layer 2](02-reference-system.md)). Replication starts from a complete, editable design — common parts, published firmware and backend, and fabbable mechanical files — rather than a reverse-engineered black box. That is what drives the cost of reproduction toward zero.

## What a complete deployment kit contains

- A complete **bill of materials**.
- **Wiring and mechanical assembly** instructions.
- A **firmware and backend setup** guide.
- **Configuration templates** for different use cases.
- **Maintenance and troubleshooting** documentation.

## How this repository delivers it

The deployable system comes in two halves: **software** you copy to a booth PC, and **hardware** you fabricate and assemble. Both are small and self-contained.

| Component | Location | Purpose |
| --- | --- | --- |
| Backend + dashboard | [`xiao-vending-machine-full-code-system/backend-full/`](../xiao-vending-machine-full-code-system/backend-full) | CSV-backed Node.js server and the Operate / Inventory / Config pages |
| Device firmware | [`xiao-vending-machine-full-code-system/frontend-vending-machine/`](../xiao-vending-machine-full-code-system/frontend-vending-machine) | The customer-facing reader, plus step-by-step bring-up sketches |
| Run helper | [`xiao-vending-machine-full-code-system/scripts/start_backend.sh`](../xiao-vending-machine-full-code-system/scripts/start_backend.sh) | Installs dependencies and starts the server anywhere |
| Hardware & assembly | [`xiao-vending-machine-assemble-steps/`](../xiao-vending-machine-assemble-steps) | The bill of materials, editable STL/STEP design files, and a ten-step build guide |

The hardware side answers two of the kit requirements above directly: the [assembly guide](../xiao-vending-machine-assemble-steps/README.md) is the **bill of materials** and the **mechanical assembly** instructions, photographed step by step.

Start the backend on any PC:

```bash
bash xiao-vending-machine-full-code-system/scripts/start_backend.sh
```

This installs dependencies and serves the dashboard at `http://localhost:3000`, exposing three operator pages:

- **Operate** — write a direct-order card or a stored-value balance card.
- **Inventory** — initialize and refill each column (up to its capacity).
- **Config** — set each Wio Terminal's WiFi and backend URL, then flash it over USB.

### Bring-up as a guided path

Replication is not only "copy and run." The [`testing_phase/`](../xiao-vending-machine-full-code-system/frontend-vending-machine/testing_phase) sketches turn hardware bring-up into an ordered, verifiable path — servo calibration (`1-a`, `1-b`), RFID (`2`), then WiFi and backend integration (`3`). Each step builds on the previous one and proves one thing works before the next is added.

### Hosting options

- **Local**, on the booth PC, via the run helper above.
- **Render**, using [`xiao-vending-machine-full-code-system/render.yaml`](../xiao-vending-machine-full-code-system/render.yaml) (`rootDir: backend-full`, `npm install`, `npm start`).
- **GitHub Codespaces**, following [`CODESPACES_SETUP.md`](../xiao-vending-machine-full-code-system/CODESPACES_SETUP.md).

## The outcome

When bring-up is a checklist, configuration is a template, and hosting is a one-liner, the machine stops being a bespoke build and becomes something a lab can reproduce with confidence. That reproducibility is the precondition for the final layer: many machines, in many places, forming a network.
