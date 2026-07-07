# Layer 2 — The Reference System

*The Xiao vending machine — where the idea becomes real.*

The Xiao vending machine is where the framework stops being an argument and becomes something you can build, run, and hold. Developed at Chaihuo Fab Lab, it is the reference that turns "vend almost anything" from a claim into a working system — and it is **open by design**, so it can be reproduced, adapted, and improved by anyone.

The reference system matters not because it is complex, but because it is **clear**. It shows that fabrication, electronics, firmware, and backend logic can be integrated into a single working pipeline — and that the pipeline can be understood as a set of modular layers communicating through well-defined interfaces.

## The four layers of the machine

| Layer | Responsibility | In this repository |
| --- | --- | --- |
| **Hardware** | Microcontroller control, RFID interaction, and mechanical actuation that physically dispenses a product | Wio Terminal + Feetech bus servos + Emakefun RFID reader; [printable parts & build guide](../xiao-vending-machine-assemble-steps) |
| **Firmware** | The state machine that handles user interaction and drives the device | [`xiao-vending-machine-full-code-system/frontend-vending-machine/official_frontend_wio_terminal/`](../xiao-vending-machine-full-code-system/frontend-vending-machine/official_frontend_wio_terminal) |
| **Backend** | Order management, validation, inventory, and product mapping | [`xiao-vending-machine-full-code-system/backend-full/`](../xiao-vending-machine-full-code-system/backend-full) |
| **Frontend** | The on-device interaction flow the customer actually sees | The Wio Terminal LCD + joystick UI, driven by the firmware |

Two microcontrollers divide the work cleanly:

- A **frontend reader** ([`official_frontend_wio_terminal`](../xiao-vending-machine-full-code-system/frontend-vending-machine/official_frontend_wio_terminal)) reads a card, asks the backend for permission, dispenses through the servos, and reports the result.
- A **backend writer** ([`wio-rfid-writer`](../xiao-vending-machine-full-code-system/backend-full/wio-rfid-writer)) encodes the RFID cards on demand, polling the backend for write jobs.

Both talk to a **CSV-backed Node.js backend and operator dashboard** ([`backend-full`](../xiao-vending-machine-full-code-system/backend-full)) over the local network. The dashboard exposes three operator pages — Operate, Inventory, and Config — and every dispense, refill, and balance change is calculated and recorded there.

## Open by design

The reference machine is meant to be copied, not admired from a distance. Five commitments make that possible:

- **Open source, end to end.** Hardware, firmware, and backend are all published to study, modify, and share. Nothing essential is locked away.
- **Modular.** Identity, ordering, control, and dispensing are separate subsystems with clean interfaces, so any one can be replaced without disturbing the rest.
- **Common parts.** It is built from off-the-shelf, low-cost components anyone can source — no exotic or single-supplier pieces.
- **Simple to assemble.** It goes together with basic tools and lab-standard fabrication (3D printing, laser cutting), within reach of any Fab Lab.
- **Yours to redesign.** The mechanical parts are provided as editable, fabbable [design files](../xiao-vending-machine-assemble-steps/hardware-preparatory/stl-files), so you can reshape them for your own product, space, or purpose.

These commitments are what let Layer 4 turn a single machine into a kit — and what keep the "vend almost anything" promise honest: anyone can not only run this machine, but change what it is.

## Why a reference system comes before abstraction

A concrete anchor makes the abstract claim honest. "Vend almost anything" is only a slogan until a real machine proves it can authenticate a user, take an order, validate stock, actuate hardware, and record the outcome.

The reference system also reveals which parts are essential and which are incidental. That distinction is exactly what the next layer needs: with a working example in hand, the underlying structure can be extracted and generalized.

## Where to look next

- To **run** the reference system, see [Layer 4 — Deployment Framework](04-deployment-framework.md).
- To **understand its structure in the abstract**, see [Layer 3 — System Design](03-system-design.md).
