// Local tools for the two Wio Terminals in the system, driven from the Config
// page. Uses arduino-cli to detect connected boards, and to set each Wio's WiFi
// (by editing the constants in its sketch) and flash it. Sketch locations are
// RELATIVE to backend-full (process.cwd()), so the whole system stays inside the
// two top-level folders: backend-full and frontend-vending-machine.

import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';

const execFileAsync = promisify(execFile);
const FQBN = 'Seeeduino:samd:seeed_wio_terminal';

// Two terminals. sketchDir is resolved relative to backend-full.
export const WIO_TARGETS = {
  frontend: {
    label: 'Frontend vending reader',
    device_id: 'frontend-1',
    sketchDir: path.resolve(process.cwd(), '../frontend-vending-machine/official_frontend_wio_terminal'),
    inoName: 'official_frontend_wio_terminal.ino',
    urlVar: 'BACKEND_BASE_URL'
  },
  writer: {
    label: 'Backend RFID writer',
    device_id: 'wio-rfid-writer',
    sketchDir: path.resolve(process.cwd(), 'wio-rfid-writer/wio_rfid_writer'),
    inoName: 'wio_rfid_writer.ino',
    urlVar: 'API_BASE'
  }
};

function inoPath(t) { return path.join(t.sketchDir, t.inoName); }

export async function hasArduinoCli() {
  try { await execFileAsync('arduino-cli', ['version']); return true; }
  catch { return false; }
}

// This machine's LAN IPv4 addresses - the addresses a Wio must point at to
// reach the backend. Used by the Config page to show/set the backend URL and
// to flag when a Wio is aimed at the wrong network.
export function serverIps() {
  const nics = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nics)) {
    for (const ni of (nics[name] || [])) {
      if (ni.family === 'IPv4' && !ni.internal) ips.push({ iface: name, address: ni.address });
    }
  }
  return ips;
}

// Serial ports for connected Wio Terminals (each has a unique serialNumber so
// two identical boards can be told apart).
export async function listWioPorts() {
  let stdout = '';
  try { ({ stdout } = await execFileAsync('arduino-cli', ['board', 'list', '--format', 'json'])); }
  catch { return []; }
  let data; try { data = JSON.parse(stdout); } catch { return []; }
  const rows = Array.isArray(data) ? data : (data.detected_ports || data.ports || []);
  const ports = [];
  for (const r of rows) {
    const port = r.port || r;
    const address = port.address || '';
    if (!address || (port.protocol && port.protocol !== 'serial')) continue;
    const props = port.properties || {};
    const vid = String(props.vid || '').toLowerCase();
    const matching = r.matching_boards || [];
    const boardName = matching.length ? (matching[0].name || '') : '';
    const boardFqbn = matching.length ? (matching[0].fqbn || '') : '';
    const isWio = boardFqbn === FQBN || /wio terminal/i.test(boardName) || vid === '0x2886';
    if (!isWio) continue;
    ports.push({ address, label: boardName || address, serial: props.serialNumber || '', vid, pid: String(props.pid || '').toLowerCase() });
  }
  return ports;
}

function readVar(content, name) {
  const re = new RegExp('const\\s+char\\s*\\*\\s*' + name + '\\s*=\\s*"([^"]*)"');
  const m = re.exec(content);
  return m ? m[1] : null;
}

function replaceVar(content, name, value) {
  const re = new RegExp('(const\\s+char\\s*\\*\\s*' + name + '\\s*=\\s*")([^"]*)(")');
  if (!re.test(content)) return content;
  const safe = String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return content.replace(re, `$1${safe}$3`);
}

export async function readConfig(targetKey) {
  const t = WIO_TARGETS[targetKey];
  if (!t) throw new Error('unknown target');
  const p = inoPath(t);
  if (!fs.existsSync(p)) return { exists: false, sketch: path.relative(process.cwd(), p) };
  const content = await fs.promises.readFile(p, 'utf8');
  return {
    exists: true,
    ssid: readVar(content, 'WIFI_SSID'),
    password: readVar(content, 'WIFI_PASSWORD'),
    backend_url: readVar(content, t.urlVar),
    url_var: t.urlVar,
    sketch: path.relative(process.cwd(), p)
  };
}

export async function writeConfig(targetKey, { ssid, password, backend_url }) {
  const t = WIO_TARGETS[targetKey];
  if (!t) throw new Error('unknown target');
  const p = inoPath(t);
  if (!fs.existsSync(p)) throw new Error('sketch not found: ' + path.relative(process.cwd(), p));
  let content = await fs.promises.readFile(p, 'utf8');
  if (ssid != null) content = replaceVar(content, 'WIFI_SSID', ssid);
  if (password != null) content = replaceVar(content, 'WIFI_PASSWORD', password);
  if (backend_url != null) content = replaceVar(content, t.urlVar, backend_url);
  await fs.promises.writeFile(p, content, 'utf8');
  return readConfig(targetKey);
}

async function runCli(args, timeout = 180000) {
  try {
    const { stdout, stderr } = await execFileAsync('arduino-cli', args, { timeout, maxBuffer: 8 * 1024 * 1024 });
    return { ok: true, out: (stdout || '') + (stderr || '') };
  } catch (e) {
    return { ok: false, out: (e.stdout || '') + (e.stderr || '') + (e.message || '') };
  }
}

// Compile + upload the target sketch to the given serial port.
export async function flash(targetKey, port) {
  const t = WIO_TARGETS[targetKey];
  if (!t) throw new Error('unknown target');
  if (!port) throw new Error('port is required');
  if (!fs.existsSync(inoPath(t))) throw new Error('sketch not found: ' + path.relative(process.cwd(), inoPath(t)));
  const buildPath = path.join(os.tmpdir(), 'wio_build_' + targetKey);
  const res = await runCli(['compile', '--upload', '-p', port, '--fqbn', FQBN, '--build-path', buildPath, t.sketchDir]);
  return { ok: res.ok, port, target: targetKey, log: res.out };
}

// Everything the Config page needs in one call.
export async function status() {
  const arduino_cli = await hasArduinoCli();
  const ports = arduino_cli ? await listWioPorts() : [];
  const targets = {};
  for (const key of Object.keys(WIO_TARGETS)) {
    const cfg = await readConfig(key);
    targets[key] = { key, label: WIO_TARGETS[key].label, device_id: WIO_TARGETS[key].device_id, ...cfg };
  }
  return { arduino_cli, fqbn: FQBN, ports, targets, server_ips: serverIps() };
}
