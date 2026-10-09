// Local device tools for the operator station: detect the USB-connected XIAO,
// flash the RFID writer firmware, and talk to the card over serial.
//
// Everything here shells out to `arduino-cli` (detect/flash) and `python3`
// scripts/card_io.py (serial), so there are no native Node dependencies.
// A single lock serializes all board access (serial + flashing) so the USB
// port is never used by two operations at once.

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ARDUINO_CLI = process.env.ARDUINO_CLI || 'arduino-cli';
const PYTHON = process.env.PYTHON || 'python3';
const FQBN = process.env.XIAO_FQBN || 'esp32:esp32:XIAO_ESP32C6';
const SKETCH_DIR = process.env.XIAO_SKETCH_DIR ||
  path.resolve(__dirname, '..', '..', 'test-phase', 'xiao-esp32c6-rfid-writer');
const CARD_IO = path.resolve(__dirname, '..', 'scripts', 'card_io.py');
const PORT_OVERRIDE = process.env.XIAO_PORT || '';

export function localToolsEnabled() {
  const v = String(process.env.LOCAL_DEVICE_TOOLS || '').toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

// Run a child process; never rejects (resolves with code + captured output).
function run(cmd, args, { timeoutMs = 120000 } = {}) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let child;
    try {
      child = spawn(cmd, args);
    } catch (err) {
      return resolve({ code: -1, stdout, stderr: String(err && err.message || err) });
    }
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* noop */ } }, timeoutMs);
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', (err) => { clearTimeout(timer); resolve({ code: -1, stdout, stderr: `${stderr}\n${err.message}` }); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
  });
}

// Serialize all board access (serial commands + flashing).
let lockChain = Promise.resolve();
function withLock(fn) {
  const result = lockChain.then(fn, fn);
  lockChain = result.then(() => {}, () => {});
  return result;
}

let lastProbe = null; // { time, rfid_ready, firmware_ok, uid, port }
let portCache = { port: null, time: 0 };
const PORT_TTL_MS = 8000;      // cache the detected port for frequent status polls
const PROBE_TTL_MS = 300000;   // trust known-good RFID readiness for 5 min while connected

function invalidatePortCache() { portCache = { port: null, time: 0 }; }

async function detectPortRaw() {
  if (PORT_OVERRIDE) return PORT_OVERRIDE;
  const { code, stdout } = await run(ARDUINO_CLI, ['board', 'list', '--format', 'json'], { timeoutMs: 15000 });
  if (code === 0) {
    try {
      const ports = JSON.parse(stdout).detected_ports || [];
      const byVid = ports.find((p) => String(p.port?.properties?.vid || '').toLowerCase() === '0x303a');
      const usb = ports.find((p) => /usbmodem|usbserial|wchusbserial|slab/i.test(p.port?.address || ''));
      const match = byVid || usb;
      if (match) return match.port.address;
    } catch { /* fall through to filesystem scan */ }
  }
  // Fallback: scan /dev directly so a slow/failed arduino-cli never hides the port.
  try {
    const devs = fs.readdirSync('/dev').filter((n) => /^cu\.(usbmodem|usbserial|wchusbserial|SLAB)/i.test(n));
    if (devs.length) return '/dev/' + devs.sort()[0];
  } catch { /* ignore */ }
  return null;
}

// Cached by default (for frequent status polls). Pass { fresh: true } for serial ops.
export async function detectPort({ fresh = false } = {}) {
  if (PORT_OVERRIDE) return PORT_OVERRIDE;
  if (!fresh && portCache.port && (Date.now() - portCache.time < PORT_TTL_MS)) return portCache.port;
  const port = await detectPortRaw();
  portCache = { port, time: Date.now() };
  return port;
}

export async function detectDevice(opts) {
  const port = await detectPort(opts);
  if (!port) return { connected: false, port: null, fqbn: FQBN };
  return { connected: true, port, fqbn: FQBN };
}

// Run one serial command via card_io.py. Serialized by withLock; refreshes the
// readiness cache on any contact and invalidates the port cache (a serial open
// resets the board, which can rename the USB port).
function cardIo(cmd, port, extra, timeoutMs) {
  return withLock(async () => {
    const args = [CARD_IO, cmd, '--port', port, ...(extra || [])];
    const { stdout, stderr } = await run(PYTHON, args, { timeoutMs });
    const lastLine = stdout.trim().split('\n').filter(Boolean).pop() || '';
    let json = null;
    try { json = JSON.parse(lastLine); } catch { /* fall through */ }
    invalidatePortCache();
    if (!json) return { ok: false, error: 'parse_error', raw: stderr || stdout };
    if (!json.raw && stderr) json.raw = stderr;
    const contacted = json.ok || json.uid || /firmware:\s*0x9[12]/i.test(json.raw || '') || /PONG/.test(json.raw || '');
    if (contacted) lastProbe = { time: Date.now(), rfid_ready: true, firmware_ok: true, uid: json.uid || (lastProbe ? lastProbe.uid : null), port };
    return json;
  });
}

export async function serialPing(port) {
  const p = port || await detectPort({ fresh: true });
  if (!p) return { ok: false, connected: false };
  const r = await cardIo('ping', p, ['--timeout', '6'], 20000);
  lastProbe = { time: Date.now(), rfid_ready: !!r.rfid_ready, firmware_ok: !!r.firmware_ok, uid: r.uid || (lastProbe ? lastProbe.uid : null), port: p };
  return { ...r, connected: true, port: p };
}

export async function serialRead(port) {
  const p = port || await detectPort({ fresh: true });
  if (!p) return { ok: false, error: 'no_device' };
  return cardIo('read', p, ['--timeout', '25'], 45000);
}

export async function serialWrite(payload, port) {
  const p = port || await detectPort({ fresh: true });
  if (!p) return { ok: false, error: 'no_device' };
  return cardIo('write', p, ['--payload', payload, '--timeout', '25'], 45000);
}

// Lightweight status for polling. Only touches the serial port when probe=true.
export async function getStatus({ probe = false } = {}) {
  const dev = await detectDevice();
  if (!dev.connected) return { connected: false, port: null, fqbn: FQBN };
  let probed = null;
  if (probe) probed = await serialPing(dev.port);
  const cache = lastProbe && (Date.now() - lastProbe.time < PROBE_TTL_MS) ? lastProbe : null;
  return {
    connected: true,
    port: dev.port,
    fqbn: FQBN,
    firmware_ok: probed ? !!probed.firmware_ok : (cache ? cache.firmware_ok : null),
    rfid_ready: probed ? !!probed.rfid_ready : (cache ? cache.rfid_ready : null),
    last_uid: probed ? (probed.uid || null) : (cache ? cache.uid : null),
  };
}

export async function flash() {
  return withLock(async () => {
    const port = await detectPort();
    if (!port) return { ok: false, log: 'No XIAO device detected on USB. Plug it in (data cable) and try again.' };
    let log = '';
    const compile = await run(ARDUINO_CLI, ['compile', '--fqbn', FQBN, SKETCH_DIR], { timeoutMs: 240000 });
    log += `$ ${ARDUINO_CLI} compile --fqbn ${FQBN} ${SKETCH_DIR}\n${compile.stdout}${compile.stderr}\n`;
    if (compile.code !== 0) return { ok: false, log, port };
    const upload = await run(ARDUINO_CLI, ['upload', '-p', port, '--fqbn', FQBN, SKETCH_DIR], { timeoutMs: 240000 });
    log += `$ ${ARDUINO_CLI} upload -p ${port} --fqbn ${FQBN} ${SKETCH_DIR}\n${upload.stdout}${upload.stderr}\n`;
    return { ok: upload.code === 0, log, port };
  });
}

export const config = { FQBN, SKETCH_DIR, CARD_IO, ARDUINO_CLI, PYTHON, PORT_OVERRIDE };
