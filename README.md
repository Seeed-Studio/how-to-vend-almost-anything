# How to Vend Almost Anything

*Using Fab to support local labs, and local labs to support local communities.*

Fabrication is no longer only about making objects. It is about enabling local systems that can produce, distribute, and sustain value in a distributed way. Fab Labs provide the foundation, vending systems provide the expression, and local communities provide the context.

This repository explores one guiding question:

> **How can fabrication practices be used to design systems that "vend almost anything" at a local scale?**

The answer is not a single machine. It is a layered framework — from an idea, to a working reference machine, to a general architecture, to a reproducible kit, to real-world economic value.

## The framework, layer by layer

| Layer | Statement | In one line |
| --- | --- | --- |
| 1 | [The Idea System](docs/01-idea-system.md) | Fabrication as local infrastructure — the premise and the guiding question. |
| 2 | [The Reference System](docs/02-reference-system.md) | Where the idea comes to life — an open-source, modular machine anyone can source, assemble, and redesign. |
| 3 | [System Design](docs/03-system-design.md) | Generalizing the machine into a portable, event-driven architecture. |
| 4 | [Deployment Framework](docs/04-deployment-framework.md) | Turning the system into a kit any lab can reproduce. |
| 5 | [Real World Value](docs/05-real-world-value.md) | From a single machine to a distributed local economy. |

Start with the [framework index](docs/README.md), or read the layers in order.

## Repository map

The narrative lives in [`docs/`](docs); the machine that makes it real lives in the two `xiao-vending-machine-*` folders — one for the code, one for the build.

```text
how-to-vend-almost-anything/
├── README.md                              You are here — the framework in brief.
├── docs/                                  The five-layer narrative, one statement per layer.
├── xiao-vending-machine-full-code-system/ The open-source software: backend, dashboard, firmware.
│   ├── backend-full/                          CSV-backed Node.js backend + operator dashboard.
│   ├── frontend-vending-machine/              Wio Terminal firmware + step-by-step bring-up sketches.
│   ├── scripts/                               Install + run helper (start_backend.sh).
│   ├── render.yaml                            One-click backend hosting on Render.
│   └── CODESPACES_SETUP.md                    Running the backend in GitHub Codespaces.
└── xiao-vending-machine-assemble-steps/   The hardware: printable parts, cut files, and a 10-step build guide.
    └── hardware-preparatory/stl-files/        The STL (print) and STEP (case) design files.
```

## Quick start

**Run the software.** Copy the three folders under `xiao-vending-machine-full-code-system/` to any booth PC, then:

```bash
bash xiao-vending-machine-full-code-system/scripts/start_backend.sh
```

This installs dependencies and serves the operator dashboard at `http://localhost:3000` — Operate, Inventory, and Config. Full deployment and hosting options are described in [Layer 4 — Deployment Framework](docs/04-deployment-framework.md).

**Build the machine.** Print and cut the parts, then follow the ten photographed steps in the [assembly guide](xiao-vending-machine-assemble-steps/README.md).

---

The vending machine is only the starting point.
