# Layer 3 — System Design

*Generalizing the architecture.*

Once a working example exists, the next task is to extract its underlying structure so that it can be adapted to other contexts. The goal of this layer is to describe *any* vending-like system — not just the Xiao machine — as a single, portable pattern.

## The canonical event sequence

Every vending-like interaction, regardless of hardware, can be expressed as the same ordered sequence of events:

1. **Initiate** — a user begins the interaction.
2. **Authorize** — the system verifies identity or authorization.
3. **Order** — an order is created or retrieved.
4. **Validate** — the system confirms availability.
5. **Actuate** — a physical action is executed: dispense, unlock, or deliver.
6. **Record** — the event is logged for tracking and feedback.

This sequence is the spine of the architecture. In the reference system it maps directly onto the backend interface:

| Event | Reference-system endpoint |
| --- | --- |
| Authorize | `POST /api/frontend/verify-card` |
| Order + Validate | `POST /api/frontend/selecting/checkout` |
| Actuate | servo plan returned to the firmware |
| Record | `POST /api/frontend/dispense-complete` |

Because the flow is event-driven rather than script-driven, the same logic can be re-implemented across different microcontrollers, dispensing mechanisms, and storage backends without changing its shape.

## Four design principles

The sequence above is held together by four principles that keep the system modular and portable.

- **Hardware abstraction.** Mechanical components are standardized and replaceable. A servo, a lock, or a conveyor are interchangeable implementations of a single "actuate" step.
- **Backend decoupling.** Decision logic is separated from physical execution. The backend decides *whether* and *what*; the device decides *how* to move.
- **State-driven control.** Behavior is defined by transitions between well-defined states, not by fixed, brittle scripts. New behavior is a new transition, not a rewrite.
- **Inventory consistency.** Physical stock is continuously reconciled with digital state, so the system never promises what it cannot deliver. In the reference machine, stock is deducted at collection time — a valid card is still refused if a column needs a refill.

## The shift this layer makes

With these elements in place, the vending machine stops being a single implementation and becomes a **reusable system architecture** — a template that a new builder can instantiate with different parts while preserving the same guarantees.

That template is what the next layer packages for replication.
