#!/usr/bin/env python3
"""Serial bridge between backend-full and the XIAO ESP32C6 RFID writer.

The backend spawns this for one command at a time. It talks to the
xiao-esp32c6-rfid-writer sketch (serial @115200: PING | READ | WRITE {json}),
writes a machine-readable JSON result to STDOUT, and streams the raw serial
log to STDERR.

Usage:
    python3 card_io.py ping  --port /dev/cu.usbmodemXXXX
    python3 card_io.py read  --port /dev/cu.usbmodemXXXX
    python3 card_io.py write --port /dev/cu.usbmodemXXXX --payload '{"user_name":"a","order_number":"O1","v":1}'
"""
import argparse
import json
import re
import sys
import time

try:
    import serial  # pyserial
except ImportError:
    print(json.dumps({"ok": False, "error": "pyserial_missing"}))
    sys.exit(0)


def drain(ser, seconds, stop_substrings=None):
    """Read serial for `seconds`, echoing to stderr, returning the text.

    Returns early once any of stop_substrings appears in the accumulated text.
    """
    buf = ""
    end = time.time() + seconds
    while time.time() < end:
        data = ser.read(256)
        if data:
            text = data.decode("utf-8", errors="replace")
            sys.stderr.write(text)
            sys.stderr.flush()
            buf += text
            if stop_substrings:
                for token in stop_substrings:
                    if token in buf:
                        return buf
        else:
            time.sleep(0.02)
    return buf


def parse_uid(text):
    m = re.search(r"Card UID:\s*([0-9A-Fa-f ]+)", text)
    return m.group(1).strip() if m else None


def parse_payload(text):
    m = re.search(r"Payload:\s*(.*)", text)
    if not m:
        return None
    value = m.group(1).strip()
    return None if value == "(empty)" else value


def open_port(port, baud):
    ser = serial.Serial(port, baud, timeout=0.2)
    # Do not assert reset lines; opening may still reset the board (USB-CDC).
    ser.dtr = False
    ser.rts = False
    return ser


def wait_ready(ser, seconds=3.5):
    """Wait until the sketch is ready to accept a command.

    Opening the USB-CDC port usually resets the board; we wait for the sketch
    banner so a command is never sent while it is still booting. Returns any
    text seen (contains the boot banner) and clears the input buffer.
    """
    text = drain(ser, seconds, stop_substrings=["Commands over serial"])
    ser.reset_input_buffer()
    return text


def cmd_ping(ser, timeout):
    boot = wait_ready(ser)                        # capture boot banner if it reset
    ser.write(b"PING\n")
    ser.flush()
    text = boot + drain(ser, timeout, stop_substrings=["PONG"])
    pong = re.search(r"PONG rfid=(\w+)", text)
    fw = re.search(r"MFRC522 firmware:\s*0x([0-9A-Fa-f]{2})", text)
    rfid_ready = False
    if pong:
        rfid_ready = pong.group(1).lower() == "ready"
    elif fw:
        rfid_ready = fw.group(1).lower() in ("91", "92")
    return {
        "ok": bool(pong or fw),
        "rfid_ready": bool(rfid_ready),
        "firmware_ok": bool(rfid_ready),
        "uid": parse_uid(text),
        "raw": text,
    }


def cmd_read(ser, timeout):
    wait_ready(ser)
    ser.write(b"READ\n")
    ser.flush()
    text = drain(ser, timeout, stop_substrings=["Payload:", "Read failed", "No card detected"])
    uid = parse_uid(text)
    ok = uid is not None and "No card detected" not in text and "Read failed" not in text
    return {"ok": ok, "uid": uid, "payload": parse_payload(text), "raw": text}


def cmd_write(ser, payload, timeout):
    wait_ready(ser)
    ser.write(("WRITE " + payload + "\n").encode("utf-8"))
    ser.flush()
    text = drain(ser, timeout,
                 stop_substrings=["WRITE OK", "WRITE FAILED", "verify mismatch", "No card detected"])
    ok = "WRITE OK" in text
    return {"ok": ok, "verified": ok, "uid": parse_uid(text),
            "payload_written": payload, "raw": text}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["ping", "read", "write"])
    ap.add_argument("--port", required=True)
    ap.add_argument("--baud", type=int, default=115200)
    ap.add_argument("--payload", default="")
    ap.add_argument("--timeout", type=float, default=None)
    args = ap.parse_args()

    try:
        ser = open_port(args.port, args.baud)
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": f"open_failed: {exc}"}))
        return

    try:
        if args.cmd == "ping":
            result = cmd_ping(ser, args.timeout if args.timeout is not None else 6)
        elif args.cmd == "read":
            result = cmd_read(ser, args.timeout if args.timeout is not None else 25)
        else:
            if not args.payload:
                result = {"ok": False, "error": "missing_payload"}
            else:
                result = cmd_write(ser, args.payload,
                                   args.timeout if args.timeout is not None else 25)
    except Exception as exc:  # noqa: BLE001
        result = {"ok": False, "error": f"serial_error: {exc}"}
    finally:
        try:
            ser.close()
        except Exception:  # noqa: BLE001
            pass

    print(json.dumps(result))


if __name__ == "__main__":
    main()
