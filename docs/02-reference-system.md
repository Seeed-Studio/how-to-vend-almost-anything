# Layer 2 — The Reference System

*The Xiao vending machine as a working case.*

An idea becomes testable only when something works. To move from concept to reality, this project anchors itself to a concrete implementation: the **Xiao vending machine** developed at Chaihuo Fab Lab.

The reference system matters not because it is complex, but because it is **clear**. It shows that fabrication, electronics, firmware, and backend logic can be integrated into a single working pipeline — and that the pipeline can be understood as a set of modular layers communicating through well-defined interfaces.

## The four layers of the machine

| Layer | Responsibility | In this repository |
| --- | --- | --- |
| **Hardware** | Microcontroller control, RFID interaction, and mechanical actuation that physically dispenses a product | Wio Terminal + Feetech bus servos + Emakefun RFID reader |
| **Firmware** | The state machine that handles user interaction and drives the device | [`xiao-vending-machine/frontend-vending-machine/official_frontend_wio_terminal/`](../xiao-vending-machine/frontend-vending-machine/official_frontend_wio_terminal) |
| **Backend** | Order management, validation, inventory, and product mapping | [`xiao-vending-machine/backend-full/`](../xiao-vending-machine/backend-full) |
| **Frontend** | The on-device interaction flow the customer actually sees | The Wio Terminal LCD + joystick UI, driven by the firmware |

Two microcontrollers divide the work cleanly:

- A **frontend reader** ([`official_frontend_wio_terminal`](../xiao-vending-machine/frontend-vending-machine/official_frontend_wio_terminal)) reads a card, asks the backend for permission, dispenses through the servos, and reports the result.
- A **backend writer** ([`wio-rfid-writer`](../xiao-vending-machine/backend-full/wio-rfid-writer)) encodes the RFID cards on demand, polling the backend for write jobs.

Both talk to a **CSV-backed Node.js backend and operator dashboard** ([`backend-full`](../xiao-vending-machine/backend-full)) over the local network. The dashboard exposes three operator pages — Operate, Inventory, and Config — and every dispense, refill, and balance change is calculated and recorded there.

## Why a reference system comes before abstraction

A concrete anchor makes the abstract claim honest. "Vend almost anything" is only a slogan until a real machine proves it can authenticate a user, take an order, validate stock, actuate hardware, and record the outcome.

The reference system also reveals which parts are essential and which are incidental. That distinction is exactly what the next layer needs: with a working example in hand, the underlying structure can be extracted and generalized.

## Where to look next

- To **run** the reference system, see [Layer 4 — Deployment Framework](04-deployment-framework.md).
- To **understand its structure in the abstract**, see [Layer 3 — System Design](03-system-design.md).
