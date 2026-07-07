# Wio Terminal RFID Writer

This folder is for the **backend-center RFID writer MCU** using **Wio Terminal + Arduino CLI**.

It contains:

```text
wio-rfid-writer/
├── wio_rfid_writer/
│   ├── wio_rfid_writer.ino
│   ├── Emakefun_RFID.h
│   └── Emakefun_RFID.cpp
├── RFID_library/RFID_test/
│   ├── Emakefun_RFID.h
│   ├── Emakefun_RFID.cpp
│   └── RFID_test.ino
└── vendor/RFID_test(1).zip
```

The uploaded RFID library ZIP is copied into `vendor/`, and the extracted RFID library/example is copied into `RFID_library/`.

## What it does

1. Powers up and initializes the Wio Terminal LCD.
2. Initializes the Emakefun MFRC522 I2C RFID module at address `0x28`.
3. Connects to Wi-Fi.
4. Checks backend-center server connectivity.
5. Shows these statuses on the Wio Terminal screen:
   - Wi-Fi
   - backend server
   - RFID module
   - card present / waiting
   - last card UID
   - current writer job
6. Polls backend-center for pending RFID write jobs.
7. When the dashboard creates an order, backend-center creates a writer job.
8. When a card is present, Wio writes the card payload and reports the result back to the server.

## Before upload

Open:

```text
wio_rfid_writer/wio_rfid_writer.ino
```

Change these values:

```cpp
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* API_BASE = "http://YOUR_PC_IP:3000";
```

Example:

```cpp
const char* API_BASE = "http://192.168.1.20:3000";
```

Do not use `localhost` on the Wio Terminal, because `localhost` means the Wio Terminal itself, not your PC.

## Arduino CLI setup

Seeed's Wio Terminal page says the Wio Terminal is Arduino-compatible and uses Seeed's board package URL. Add this URL to Arduino CLI:

```bash
arduino-cli config init
arduino-cli config add board_manager.additional_urls https://files.seeedstudio.com/arduino/package_seeeduino_boards_index.json
arduino-cli core update-index
arduino-cli core install Seeeduino:samd
```

Compile:

```bash
cd backend-full/wio-rfid-writer/wio_rfid_writer
arduino-cli compile --fqbn Seeeduino:samd:seeed_wio_terminal .
```

Upload, replacing the port with your Wio Terminal port:

```bash
arduino-cli board list
arduino-cli upload -p /dev/cu.usbmodemXXXX --fqbn Seeeduino:samd:seeed_wio_terminal .
```

On macOS, the Wio Terminal port often looks like `/dev/cu.usbmodem141401`.

## Wiring

For the Emakefun I2C RFID module:

```text
RFID 5V  -> Wio 5V
RFID GND -> Wio GND
RFID SDA -> Wio I2C SDA
RFID SCL -> Wio I2C SCL
```

The example library uses:

```cpp
MFRC522 mfrc522(0x28);
Wire.begin();
mfrc522.PCD_Init();
```

## Important card note

This sketch writes MIFARE Classic-style data blocks using the default key `FF FF FF FF FF FF`.

It writes up to 96 bytes across blocks:

```text
4, 5, 6, 8, 9, 10
```

It intentionally avoids sector trailer blocks like `7` and `11`.

If your card is not MIFARE Classic 1K or uses a different key/access setting, the UID may still read, but writing can fail.

## Backend APIs used by Wio

- `POST /api/rfid-writer/status`
- `GET /api/rfid-writer/next-job`
- `POST /api/rfid-writer/job-result`

Headers:

```http
x-device-id: wio-rfid-writer
x-api-key: WIO_WRITER_SECRET
```
