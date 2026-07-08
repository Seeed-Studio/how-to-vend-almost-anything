# Xiao Vending Machine — Hardware & Assembly

*Print it, cut it, build it — the open-source hardware behind the [reference machine](../docs/02-reference-system.md).*

This guide covers the physical build: the parts you fabricate, and ten photographed steps from a single dispenser to the finished machine. The software that brings it to life — backend, dashboard, and firmware — lives in [`xiao-vending-machine-full-code-system/`](../xiao-vending-machine-full-code-system). For where this fits in the bigger picture, see [Layer 4 — Deployment Framework](../docs/04-deployment-framework.md).

Photos, wiring diagram, and test videos live in [`assets/`](assets/).

## What you'll fabricate

Every design file is open and editable, so you can adapt a part before you make it. All files live under [`hardware-preparatory/stl-files/`](hardware-preparatory/stl-files).

### 3D-printed parts — [`parts/`](hardware-preparatory/stl-files/parts) (STL)

| Part | Quantity |
| --- | --- |
| `dispenser.stl` | 4 |
| `dispenser arm.stl` | 4 |
| `Spur Gear 24 teeth.stl` | 1 |
| `Tube support .stl` | 1 |
| `Pillar A .stl` | 1 |
| `Pillar B.stl` | 1 |
| `L holder.stl` | 6 |
| `slider_wio holder .stl` | 1 |
| `RF ID cap .stl` | 1 |
| `LED holder .stl` | 1 |
| `LED diffuser.stl` | 1 |
| `small feet .stl` | 4 |

### Case & structural parts — [`case/`](hardware-preparatory/stl-files/case) (STEP)

| Part | Quantity |
| --- | --- |
| `outer enclosure.step` | 1 |
| `top plate.step` | 1 |
| `back plate .step` | 1 |
| `lock holder.step` | 1 |
| `Mag plate.step` | 1 |

STEP files are editable CAD solids — adapt them, then export for your own printer, CNC, or laser cutter.

### Off-the-shelf electronics

Sourced separately and driven by the [code system](../xiao-vending-machine-full-code-system): two Wio Terminals (the front reader and the card writer), four Feetech SMS/STS bus servos, an Emakefun I2C RFID reader, and MIFARE Classic cards. Wiring and flashing are covered there.

## Assembly, step by step

Each step pairs the CAD design with a photo of the real build.

### 1. The dispenser unit

Build one dispensing column: the dispenser body, its arm, and the 24-tooth spur gear that a bus servo turns to release a single product.

| Design | Real build |
| --- | --- |
| ![Dispenser unit — design](assets/1-dispense-part-design.png) | ![Dispenser unit — real build](assets/1-dispense-part-real-life.jpg) |

### 2. The full dispenser bank

Repeat the unit four times and tie them together with the tube support to form the four-column dispenser bank.

| Design | Real build |
| --- | --- |
| ![Full dispenser bank — design](assets/2-full-dispense-part-design.png) | ![Full dispenser bank — real build](assets/2-full-dispense-part-real-life.jpg) |

### 3. Pillars A & B — the frame

Stand up Pillars A and B and join them with the L holders to form the machine's load-bearing skeleton.

| Design | Design (detail) | Real build |
| --- | --- | --- |
| ![Pillars — design A](assets/3-piller-A-B-design-a.png) | ![Pillars — design B](assets/3-piller-A-B-design-b.jpg) | ![Pillars — real build](assets/3-piller-A-B-real-life.jpg) |

### 4. The back plate

Mount the back plate onto the frame to close and stiffen the rear of the machine.

| Design | Real build |
| --- | --- |
| ![Back plate — design](assets/4-back-plate-design.jpg) | ![Back plate — real build](assets/4-back-plate-real-life.jpg) |

### 5. The slider & Wio holder

Fit the slider that carries and positions the customer-facing Wio Terminal.

| Design | Real build |
| --- | --- |
| ![Slider — design](assets/5-slider-part-design.png) | ![Slider — real build](assets/5-slider-part-real-life.jpg) |

### 6. The Wio Terminal & RFID reader

Install the front Wio Terminal and seat the RFID reader behind its cap, with the LED holder and diffuser for the status light.

| Design | Real build |
| --- | --- |
| ![Wio Terminal and RFID — design](assets/6-wio-terminal-rfid-design.png) | ![Wio Terminal and RFID — real build](assets/6-wio-terminal-rfid-real-life.jpg) |

### 7. The column tops

Cap the product columns with the top plate to guide and retain the stock.

| Design | Real build |
| --- | --- |
| ![Column tops — design](assets/7-columns-top-deisgn.png) | ![Column tops — real build](assets/7-columns-top-real-life.jpg) |

### 8. The outer enclosure

Wrap the build in the outer enclosure and add the four small feet.

| Design | Real build |
| --- | --- |
| ![Outer enclosure — design](assets/8-fixed-case-design.png) | ![Outer enclosure — real build](assets/8-fixed-case-real-life.jpg) |

### 9. The top lock & hinge

Fit the lock holder and magnetic plate so the top opens for refilling and closes securely.

| Design | Real build |
| --- | --- |
| ![Top lock and hinge — design](assets/9-top-lock-hinge-design.png) | ![Top lock and hinge — real build](assets/9-top-lock-hinge-real-life.jpg) |

### 10. The finished machine

The completed, open-source Xiao vending machine — ready to load, flash, and run.

| Design | Real build |
| --- | --- |
| ![Finished machine — design](assets/10-assemble-final-look-design.png) | ![Finished machine — real build](assets/10-assemble-final-look-real-life.jpg) |

## Wio Terminal connection

The customer-facing Wio Terminal drives two peripherals through the 40-pin header on its back. Wire both before flashing the frontend firmware.

![Wio Terminal wiring — servos and RFID](assets/xiao-vending-machine-connection.png)

### Part 1 — Servo bus (UART)

The four Feetech serial servos share one UART bus. Connect the servo controller's **RX** to header pin **8 (TXD)** and **TX** to pin **10 (RXD)**. Share **GND** with the Wio (pin 9 or any GND).

### Part 2 — RFID reader (I2C)

The Emakefun MFRC522 reader sits on I2C. Connect **SDA** to pin **27**, **SCL** to pin **28**, **5V** to pin **2**, and **GND** to pin **9**.

Both peripherals must be on the same Wio Terminal that runs [`official_frontend_wio_terminal`](../xiao-vending-machine-full-code-system/frontend-vending-machine/official_frontend_wio_terminal). The second Wio Terminal is the operator-side **card writer** — it only needs WiFi to the backend and its own RFID module; flash it from the [Config page](../xiao-vending-machine-full-code-system/backend-full/public/config.html).

## Testing phase — dispense modes

After hardware assembly and software bring-up, verify both customer flows on the finished machine. These recordings show the reference machine running the official firmware and backend.

### Direct dispensing

A **direct-order card** carries a fixed product list. The customer taps the card and the machine dispenses every item on it in one pass.

<video src="assets/direct-dispense-testing.mp4" controls width="720"></video>

### Balance dispensing

A **selecting balance card** stores a customer name and stored value. The customer picks products on the Wio Terminal joystick until the balance is spent.

<video src="assets/balance-dispense-testing.mp4" controls width="720"></video>

For the incremental bring-up path before this end-to-end test, see [`testing_phase/`](../xiao-vending-machine-full-code-system/frontend-vending-machine/testing_phase) in the code system.

## Next: bring it to life

With the hardware assembled, install the software and flash the two Wio Terminals following [`xiao-vending-machine-full-code-system/`](../xiao-vending-machine-full-code-system) and [Layer 4 — Deployment Framework](../docs/04-deployment-framework.md).
