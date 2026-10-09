'use strict';

// =====================================================
// 3-backend-wifi-testing
// =====================================================
// A tiny, zero-dependency backend for the phase-3 WiFi test. Run it on
// your PC (same WiFi as the Wio Terminal). It:
//   1. prints this PC's IPv4 address(es) so you can point the Wio at it,
//   2. answers POST /verify with "true" / "false" for a {name,type} card,
//   3. logs the POST /report JSON the Wio sends after it dispenses.
//
// Run:   node server.js            (port 80 needs admin -> sudo node server.js)
//        PORT=8080 node server.js  (no admin; then use :8080 on the Wio)
// =====================================================

const http = require('http');
const os = require('os');

const PORT = Number(process.env.PORT) || 80;
const EXPECTED_IP = '192.168.7.164';   // the Wio sketch's default backend IP

// Cards the machine is allowed to serve. Edit this list to test the
// "false" path (remove an entry, or present a card that is not here).
const ALLOWED = [
  { name: 'Matthew', type: 'balance' },
  { name: 'Alice',   type: 'prepaid' },
];

function localIPv4s() {
  const out = [];
  try {
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
      for (const net of ifaces[name] || []) {
        if (net.family === 'IPv4' && !net.internal) out.push({ iface: name, address: net.address });
      }
    }
  } catch (err) {
    console.warn('[WARN] could not read network interfaces:', err.message);
  }
  return out;
}

function isAllowed(name, type) {
  return ALLOWED.some(a => a.name === name && a.type === type);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 1e6) req.destroy();   // basic guard
    });
    req.on('end', () => resolve(data));
  });
}

function parseMaybeJson(raw) {
  try { return JSON.parse(raw); } catch { return null; }
}

const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  const ts = new Date().toISOString();

  // CORS (harmless for the Wio, handy if you poke it from a browser).
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  if (req.method === 'GET' && (url === '/' || url === '/health')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, service: '3-backend-wifi-testing', time: ts, allowed: ALLOWED }));
  }

  // The Wio asks "is this card allowed?" -> reply plain "true" / "false".
  if (req.method === 'POST' && url === '/verify') {
    const raw = await readBody(req);
    const obj = parseMaybeJson(raw) || {};
    const name = String(obj.name ?? '');
    const type = String(obj.type ?? '');
    const allow = isAllowed(name, type);
    console.log(`[${ts}] VERIFY name=${JSON.stringify(name)} type=${JSON.stringify(type)} -> ${allow}`);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end(allow ? 'true' : 'false');
  }

  // The Wio reports what it dispensed -> log the JSON.
  if (req.method === 'POST' && url === '/report') {
    const raw = await readBody(req);
    const obj = parseMaybeJson(raw);
    console.log(`[${ts}] REPORT ${raw}`);
    if (obj && Array.isArray(obj.servos)) {
      for (const s of obj.servos) console.log(`          - servo ${s.id} rotated ${s.times} time(s)`);
      console.log(`          servo_count=${obj.servo_count}  total_rotations=${obj.total_rotations}`);
    }
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('ok');
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('not found');
});

server.on('error', (err) => {
  if (err.code === 'EACCES') {
    console.error(`\n[ERROR] Permission denied binding port ${PORT}.`);
    console.error('  Port 80 needs admin. Use:  sudo node server.js');
    console.error('  or run on a high port:      PORT=8080 node server.js');
    console.error('  (then set the Wio BACKEND_BASE to http://<this-ip>:8080)\n');
  } else if (err.code === 'EADDRINUSE') {
    console.error(`\n[ERROR] Port ${PORT} is already in use. Stop the other process or set PORT.\n`);
  } else {
    console.error(err);
  }
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
  const ips = localIPv4s();
  console.log('========================================================');
  console.log(' 3-backend-wifi-testing   (Wio verify + report backend)');
  console.log('========================================================');
  console.log(` Listening on 0.0.0.0:${PORT}`);
  console.log(' This PC IPv4 address(es):');
  if (ips.length === 0) console.log('   (none found - are you on WiFi?)');
  for (const ip of ips) {
    const tag = ip.address === EXPECTED_IP ? '   <-- matches the Wio default' : '';
    console.log(`   ${ip.address}   (${ip.iface})${tag}`);
  }
  console.log('');
  if (ips.some(i => i.address === EXPECTED_IP)) {
    console.log(` OK: the Wio default http://${EXPECTED_IP}:${PORT} points at this PC.`);
  } else {
    console.log(` NOTE: this PC is not ${EXPECTED_IP}.`);
    console.log('   Either give this PC that IP, or set BACKEND_BASE in the Wio');
    console.log('   sketch to one of the address(es) above.');
  }
  console.log('');
  console.log(' Endpoints:');
  console.log('   GET  /         -> health JSON');
  console.log('   POST /verify   -> body {"name","type"}  replies "true"/"false"');
  console.log('   POST /report   -> body {servos:[{id,times}], ...}  replies "ok"');
  console.log('========================================================');
});
