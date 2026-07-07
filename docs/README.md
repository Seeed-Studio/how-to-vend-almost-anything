# The Framework

*How to Vend Almost Anything — read layer by layer.*

This project is organized as a five-layer framework. Each layer is a self-contained statement that builds on the one before it, moving from an idea to a working machine, to a general architecture, to a repeatable kit, and finally to its value in the real world.

Read them in order, or jump to the layer you need.

| Layer | Statement | In one line |
| --- | --- | --- |
| 1 | [The Idea System](01-idea-system.md) | Fabrication as local infrastructure — the premise and the guiding question. |
| 2 | [The Reference System](02-reference-system.md) | The Xiao vending machine as a concrete, working case. |
| 3 | [System Design](03-system-design.md) | Generalizing the machine into a portable, event-driven architecture. |
| 4 | [Deployment Framework](04-deployment-framework.md) | Turning the system into a kit any lab can reproduce. |
| 5 | [Real World Value](05-real-world-value.md) | From a single machine to a distributed local economy. |

## The through-line

> How can fabrication practices be used to design systems that "vend almost anything" at a local scale?

Layer 1 asks the question. Layer 2 answers it with a real machine. Layer 3 extracts the pattern behind that machine. Layer 4 makes the pattern reproducible. Layer 5 explains why the result matters.

## From narrative to code

The concrete implementation of Layers 2 and 4 lives in [`../xiao-vending-machine/`](../xiao-vending-machine). The table below maps each layer to what you can actually open, run, or flash.

| Layer | Where it becomes real |
| --- | --- |
| 2 — Reference System | [`xiao-vending-machine/backend-full/`](../xiao-vending-machine/backend-full), [`xiao-vending-machine/frontend-vending-machine/`](../xiao-vending-machine/frontend-vending-machine) |
| 3 — System Design | The backend API in [`xiao-vending-machine/backend-full/src/server.mjs`](../xiao-vending-machine/backend-full/src/server.mjs) |
| 4 — Deployment Framework | [`xiao-vending-machine/scripts/`](../xiao-vending-machine/scripts), [`xiao-vending-machine/render.yaml`](../xiao-vending-machine/render.yaml), [`xiao-vending-machine/CODESPACES_SETUP.md`](../xiao-vending-machine/CODESPACES_SETUP.md) |
