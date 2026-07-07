const $ = (id) => document.getElementById(id);
const TARGETS = ['frontend', 'writer'];
const inputsInit = { frontend: false, writer: false };
const flashing = { frontend: false, writer: false };
let serverIps = [];
const serverPort = window.location.port || '3000';

async function api(path, opts = {}) {
  const response = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const data = await response.json();
  if (!response.ok || data.ok === false) throw new Error(data.message || data.error || 'Request failed');
  return data;
}
function showToast(message) {
  const toast = $('toast'); toast.textContent = message; toast.classList.remove('hidden');
  clearTimeout(showToast._timer); showToast._timer = setTimeout(() => toast.classList.add('hidden'), 3600);
}

// Pull the host out of "http://1.2.3.4:3000/foo".
function hostOf(url) {
  if (!url) return '';
  let h = String(url).replace(/^https?:\/\//i, '');
  h = h.split('/')[0].split(':')[0];
  return h.trim();
}
function subnet24(ip) {
  const m = /^(\d+)\.(\d+)\.(\d+)\.\d+$/.exec(ip || '');
  return m ? `${m[1]}.${m[2]}.${m[3]}` : '';
}

function portLabel(p) {
  const tail = p.serial ? p.serial.slice(-6) : '';
  return `${p.address}${tail ? '  (SN ' + tail + ')' : ''}`;
}
function populatePorts(target, ports) {
  const sel = $(`port_${target}`);
  const prev = sel.value;
  if (!ports.length) { sel.innerHTML = '<option value="">No Wio detected on USB</option>'; return; }
  sel.innerHTML = ports.map(p => `<option value="${p.address}">${portLabel(p)}</option>`).join('');
  if (prev && ports.some(p => p.address === prev)) sel.value = prev;
}

function renderServerIps() {
  const el = $('serverIpList');
  if (!serverIps.length) { el.textContent = 'No LAN address detected on this computer (is it on Wi-Fi/Ethernet?).'; return; }
  el.innerHTML = serverIps.map(s => `<span class="server-ip">http://${s.address}:${serverPort} <span style="opacity:.6">(${s.iface})</span></span>`).join('');
}

// The "network matched?" indicator for one Wio, comparing its saved backend URL
// to this computer's LAN addresses.
function renderNetMatch(target, cfg) {
  const line = $(`match_${target}`);
  if (!serverIps.length) { line.className = 'net-line'; line.textContent = 'Restart the backend (npm start) to detect this computer\u2019s network.'; return; }
  const host = hostOf(cfg && cfg.backend_url);
  if (!host) { line.className = 'net-line bad'; line.textContent = 'No backend URL set - click a "Use ..." button below.'; return; }
  if (serverIps.some(s => s.address === host)) {
    line.className = 'net-line ok';
    line.textContent = `Network matched: points at this computer (${host}).`;
    return;
  }
  const sameSubnet = serverIps.some(s => subnet24(s.address) && subnet24(s.address) === subnet24(host));
  line.className = 'net-line bad';
  if (sameSubnet) {
    line.textContent = `Backend URL is ${host}; this computer is a different address on the same subnet - use a "Use ..." button below.`;
  } else {
    line.textContent = `Network NOT matched: Wio points at ${host}, but this computer is ${serverIps.map(s => s.address).join(', ') || 'unknown'}. Put both on the same Wi-Fi, then use a button below.`;
  }
}

function renderUseIpButtons(target) {
  const row = $(`useip_${target}`);
  if (!serverIps.length) { row.innerHTML = ''; return; }
  row.innerHTML = serverIps.map(s => `<button class="secondary" data-ip="${s.address}" data-target="${target}">Use ${s.address}</button>`).join('');
  [...row.querySelectorAll('[data-ip]')].forEach(b => b.addEventListener('click', () => useServerIp(target, b.dataset.ip)));
}

function renderTarget(target, cfg, ports) {
  if (!inputsInit[target] && cfg && cfg.exists) {
    $(`ssid_${target}`).value = cfg.ssid || '';
    $(`pass_${target}`).value = cfg.password || '';
    $(`url_${target}`).value = cfg.backend_url || '';
    inputsInit[target] = true;
  }
  const badge = $(`badge_${target}`);
  if (!ports.length) { badge.className = 'pill muted'; badge.textContent = 'No Wio on USB'; }
  else { badge.className = 'pill online'; badge.textContent = `Wio detected (${ports.length})`; }
  populatePorts(target, ports);
  renderNetMatch(target, cfg);
  renderUseIpButtons(target);
  if (!flashing[target]) {
    $(`flashmsg_${target}`).textContent = cfg && cfg.exists ? `Sketch: ${cfg.sketch}` : 'Sketch not found';
  }
}

function renderWriterRuntime(rt) {
  const el = $('runtime_writer');
  if (rt && rt.online) {
    const rfid = rt.status && rt.status.rfid_ready === 'true' ? 'RFID ready' : 'RFID not ready';
    el.textContent = `Runtime: online - ${rfid} - reaching the backend.`;
  } else {
    el.textContent = 'Runtime: not reporting. It comes online once WiFi + backend URL are correct and it is on the same network as this computer.';
  }
}

async function loadStatus() {
  if (flashing.frontend || flashing.writer) return;
  let data;
  try { data = await api('/api/wio/status'); }
  catch (e) { $('toolBanner').className = 'banner warn'; $('toolBanner').textContent = e.message; return; }

  serverIps = data.server_ips || [];
  renderServerIps();

  const banner = $('toolBanner');
  if (!data.arduino_cli) {
    banner.className = 'banner warn';
    banner.innerHTML = 'arduino-cli was not found on this machine. You can still edit and save WiFi settings, but flashing needs the backend running locally with <code>arduino-cli</code> installed and the Wio connected by USB.';
  } else {
    banner.className = 'banner ok';
    banner.innerHTML = `arduino-cli ready. Detected Wio Terminals on USB: <strong>${data.ports.length}</strong>.`;
  }
  for (const t of TARGETS) renderTarget(t, data.targets[t], data.ports);
  renderWriterRuntime(data.writer_runtime);
}

async function useServerIp(target, ip) {
  const url = `http://${ip}:${serverPort}`;
  $(`url_${target}`).value = url;
  try {
    const body = { target, ssid: $(`ssid_${target}`).value.trim(), password: $(`pass_${target}`).value, backend_url: url };
    const data = await api('/api/wio/wifi', { method: 'POST', body: JSON.stringify(body) });
    inputsInit[target] = false;
    renderTarget(target, data.config, []);
    showToast(`Backend URL set to ${url}. Now flash ${target}.`);
  } catch (e) { showToast(e.message); }
}

async function saveWifi(target) {
  const body = {
    target,
    ssid: $(`ssid_${target}`).value.trim(),
    password: $(`pass_${target}`).value,
    backend_url: $(`url_${target}`).value.trim()
  };
  const btn = $(`save_${target}`); const label = btn.textContent; btn.disabled = true; btn.textContent = 'Saving...';
  try {
    const data = await api('/api/wio/wifi', { method: 'POST', body: JSON.stringify(body) });
    inputsInit[target] = false;
    renderTarget(target, data.config, []);
    showToast('WiFi settings saved. Flash to apply them.');
  } catch (e) { showToast(e.message); }
  finally { btn.disabled = false; btn.textContent = label; }
}

async function flashTarget(target) {
  const port = $(`port_${target}`).value;
  if (!port) return showToast('No Wio Terminal detected on USB. Plug one in, then Refresh.');
  flashing[target] = true;
  const btn = $(`flash_${target}`); const label = btn.textContent; btn.disabled = true; btn.textContent = 'Uploading...';
  const msg = $(`flashmsg_${target}`); msg.textContent = `Uploading to ${port} (up to ~60s, do not unplug)...`;
  const wrap = $(`logwrap_${target}`); const log = $(`log_${target}`);
  wrap.classList.remove('hidden'); log.textContent = 'Compiling and uploading...\n';
  try {
    const res = await fetch('/api/wio/flash', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target, port }) });
    const data = await res.json();
    log.textContent = data.log || data.message || '(no output)';
    msg.textContent = data.ok ? `Done - uploaded to ${port}.` : 'Flash failed - see log below.';
    showToast(data.ok ? 'Upload complete.' : (data.message || 'Flash failed.'));
  } catch (e) {
    log.textContent = e.message; msg.textContent = 'Flash failed.'; showToast('Flash failed: ' + e.message);
  } finally {
    flashing[target] = false; btn.disabled = false; btn.textContent = label;
    setTimeout(loadStatus, 1200);
  }
}

$('refreshBtn').addEventListener('click', loadStatus);
for (const t of TARGETS) {
  $(`save_${t}`).addEventListener('click', () => saveWifi(t));
  $(`flash_${t}`).addEventListener('click', () => flashTarget(t));
}
loadStatus();
setInterval(loadStatus, 5000);
