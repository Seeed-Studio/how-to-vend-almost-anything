import express from 'express';
import cors from 'cors';
import path from 'path';
import { nanoid } from 'nanoid';
import { readCsv, writeCsv, appendCsv, nowIso } from './csvStore.mjs';
import * as device from './deviceTools.mjs';
import * as wio from './wioTools.mjs';
import { readProducts, writeProducts, readCards, writeCards } from './dataMap.mjs';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static('public'));

const customerHeaders = ['user_name','total_paid','total_orders','last_order_number','created_at','updated_at'];
const orderHeaders = ['order_number','user_name','product_id','product_name','quantity','amount_paid','status','rfid_card_uid','written_payload','created_at','written_at','verified_at','dispensed_at','frontend_id','notes'];
const inventoryLogHeaders = ['time','action','product_id','product_name','quantity_delta','inventory_after','actor','notes'];
const writerJobHeaders = ['job_id','order_number','user_name','rfid_payload','rfid_card_uid','status','created_at','claimed_at','written_at','device_id','message','job_type'];
const deviceStatusHeaders = ['device_id','device_type','server_connected','rfid_ready','card_present','last_card_uid','current_job_id','last_seen_at','message'];
const cardLedgerHeaders = ['time','card_uid','user_name','type','amount','balance_after','actor','notes'];

const validOrderStartStates = new Set(['RFID_WRITTEN']);
const WIO_TARGET_KEYS = ['frontend', 'writer'];

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function requireDevice(req, res, next) {
  const deviceId = req.header('x-device-id');
  const apiKey = req.header('x-api-key');
  readCsv('devices.csv').then(devices => {
    const found = devices.find(d => d.device_id === deviceId && d.api_key === apiKey && d.enabled === 'true');
    if (!found) return res.status(401).json({ ok: false, error: 'Invalid device credentials' });
    req.device = found;
    next();
  }).catch(next);
}

// Gate for the local-only USB features (detect / flash / serial write).
function requireLocalTools(req, res, next) {
  if (!device.localToolsEnabled()) {
    return res.status(501).json({
      ok: false,
      error: 'local_device_tools_disabled',
      message: 'Set LOCAL_DEVICE_TOOLS=1 and run backend-full on the machine with the XIAO connected via USB.'
    });
  }
  next();
}

function parseBalanceFromPayload(payload) {
  if (!payload) return null;
  try {
    const obj = JSON.parse(payload);
    if (obj && obj.balance != null && Number.isFinite(Number(obj.balance))) return Number(obj.balance);
  } catch { /* not JSON, try regex */ }
  const m = /"balance"\s*:\s*(\d+(?:\.\d+)?)/.exec(payload);
  return m ? Number(m[1]) : null;
}

// Turn a serial write/read failure into an operator-friendly message.
function friendlyCardError(result) {
  const raw = result.raw || '';
  if (result.error === 'no_device') return 'No XIAO detected on USB. Open Device Setup to connect or flash.';
  if (/No card detected/i.test(raw)) return 'No card detected. Place the card flat on the reader and keep it there until it finishes.';
  if (/verify mismatch/i.test(raw)) return 'Card write could not be verified. Re-seat the card and try again.';
  if (result.error === 'parse_error') return 'The RFID writer did not respond. Re-flash the firmware from Device Setup, then retry.';
  return 'Card write failed. Use a MIFARE Classic 1K card, re-seat it, and retry.';
}

// Create a "direct" order row. Throws Error with .code for HTTP status.
// Official model: stock is NOT reserved here. It is deducted at dispense time
// (verify-card), so a card is only ever fulfilled if the column still has stock
// when the customer collects - and the machine stops if a refill is needed.
async function createOrderRecord({ user_name, product_id, quantity, amount_paid, rfid_card_uid, status, notes }) {
  const qty = toNumber(quantity, 1);
  const rawProducts = await readProducts();
  const product = rawProducts.find(p => p.product_id === product_id);
  if (!product || String(product.active) !== 'true') { const e = new Error('product unavailable'); e.code = 404; throw e; }
  if (toNumber(product.inventory) < qty) { const e = new Error('not enough inventory'); e.code = 409; throw e; }

  const order_number = makeOrderNumber();
  const written_payload = makeWriterPayload(user_name, order_number);
  const orders = await readCsv('orders.csv');
  const newOrder = {
    order_number, user_name, product_id, product_name: product.product_name,
    quantity: String(qty), amount_paid: String(amount_paid ?? ''), status,
    rfid_card_uid: rfid_card_uid || '', written_payload, created_at: nowIso(),
    written_at: '', verified_at: '', dispensed_at: '', frontend_id: '', notes: notes || ''
  };
  orders.push(newOrder);
  await writeCsv('orders.csv', orders, orderHeaders);

  const customers = await readCsv('customers.csv');
  let customer = customers.find(c => c.user_name === user_name);
  if (!customer) { customer = { user_name, total_paid: '0', total_orders: '0', last_order_number: '', created_at: nowIso(), updated_at: nowIso() }; customers.push(customer); }
  customer.total_paid = String(toNumber(customer.total_paid) + toNumber(amount_paid));
  customer.total_orders = String(toNumber(customer.total_orders) + 1);
  customer.last_order_number = order_number;
  customer.updated_at = nowIso();
  await writeCsv('customers.csv', customers, customerHeaders);

  return { order: newOrder, product, written_payload };
}

async function getProducts() {
  const products = await readProducts();
  return products.map(p => {
    const inventory = toNumber(p.inventory);
    const threshold = toNumber(p.low_stock_threshold);
    const maxCapacity = toNumber(p.max_capacity, 10) || 10;
    return {
      ...p,
      price: toNumber(p.price),
      inventory,
      low_stock_threshold: threshold,
      max_capacity: maxCapacity,
      active: String(p.active) === 'true',
      is_low_stock: inventory <= threshold,
      needs_refill: inventory <= threshold,
      is_full: inventory >= maxCapacity,
      available: inventory > 0
    };
  });
}

// Fixed 4-length arrays indexed by servo id 1..4, for the on-screen selecting UI.
function servoIndexedArrays(products) {
  const name = ['', '', '', ''];
  const price = [0, 0, 0, 0];
  const stock = [0, 0, 0, 0];
  const needs = [0, 0, 0, 0];
  const active = [0, 0, 0, 0];
  for (const p of products) {
    const s = toNumber(p.servo_id);
    if (s >= 1 && s <= 4) {
      name[s - 1] = p.product_name || '';
      price[s - 1] = toNumber(p.price);
      stock[s - 1] = toNumber(p.inventory);
      needs[s - 1] = (toNumber(p.inventory) <= toNumber(p.low_stock_threshold)) ? 1 : 0;
      active[s - 1] = (String(p.active) === 'true') ? 1 : 0;
    }
  }
  return { servo: [1, 2, 3, 4], name: name.join('|'), price, stock, needs_refill: needs, active };
}

function makeOrderNumber() {
  const d = new Date();
  const stamp = d.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `ORD-${stamp}-${nanoid(6).toUpperCase()}`;
}

function makeWriterPayload(userName, orderNumber) {
  return JSON.stringify({ type: 'direct', user_name: userName, order_number: orderNumber, v: 1 });
}

function makeBalancePayload(userName) {
  return JSON.stringify({ type: 'selecting', user_name: userName, v: 1 });
}

// Resolve an order's line items. Multi-product direct orders (product_id MULTI)
// and selecting checkouts (SELECT) store a JSON array in written_payload; a
// plain single-product order is just its own product_id + quantity.
function orderItems(order) {
  if (order.product_id === 'MULTI' || order.product_id === 'SELECT') {
    try { return JSON.parse(order.written_payload || '[]'); } catch { return []; }
  }
  if (order.product_id) return [{ product_id: order.product_id, qty: toNumber(order.quantity, 1) }];
  return [];
}

// Give stock (and, for selecting, balance) back when a dispense is reported
// failed or an in-flight order is cancelled. The stock was removed at the
// authorize step (verify-card / selecting checkout).
async function rollbackOrder(order, actor) {
  const rawProducts = await readProducts();
  const items = orderItems(order);
  for (const item of items) {
    const product = rawProducts.find(p => p.product_id === item.product_id);
    if (!product) continue;
    product.inventory = String(toNumber(product.inventory) + toNumber(item.qty));
    await appendCsv('inventory_log.csv', { time: nowIso(), action: 'DISPENSE_ROLLBACK', product_id: product.product_id, product_name: product.product_name, quantity_delta: toNumber(item.qty), inventory_after: product.inventory, actor, notes: order.order_number }, inventoryLogHeaders);
  }
  await writeProducts(rawProducts);

  if (order.product_id === 'SELECT' && toNumber(order.amount_paid) > 0) {
    const cards = await readCards();
    const card = cards.find(c => c.user_name === order.user_name);
    if (card) {
      const refunded = toNumber(card.balance) + toNumber(order.amount_paid);
      card.balance = String(refunded);
      card.updated_at = nowIso();
      await writeCards(cards);
      await appendCsv('card_ledger.csv', { time: nowIso(), card_uid: card.card_uid || order.rfid_card_uid || '', user_name: order.user_name, type: 'REFUND', amount: String(toNumber(order.amount_paid)), balance_after: String(refunded), actor, notes: order.order_number }, cardLedgerHeaders);
    }
  }
}

// Create a multi-product "direct" order: the operator pre-selects several
// products + quantities on one card. Items live in written_payload as JSON;
// stock is deducted at dispense time (verify-card), like single-product orders.
async function createDirectMultiOrder({ user_name, items, amount_paid, rfid_card_uid }) {
  const rawProducts = await readProducts();
  const clean = [];
  const names = [];
  let total = 0, units = 0;
  for (const it of (items || [])) {
    const qty = Math.max(0, Math.round(toNumber(it.quantity ?? it.qty, 0)));
    if (qty <= 0) continue;
    const product = rawProducts.find(p => p.product_id === it.product_id);
    if (!product || String(product.active) !== 'true') { const e = new Error(`product ${it.product_id} unavailable`); e.code = 404; throw e; }
    if (toNumber(product.inventory) < qty) { const e = new Error(`not enough inventory for ${product.product_name}`); e.code = 409; throw e; }
    clean.push({ product_id: product.product_id, qty });
    names.push(`${product.product_name} x${qty}`);
    total += toNumber(product.price) * qty;
    units += qty;
  }
  if (clean.length === 0) { const e = new Error('select at least one product'); e.code = 400; throw e; }

  const order_number = makeOrderNumber();
  const written_payload = makeWriterPayload(user_name, order_number); // card JSON for the writer
  const amount = (amount_paid !== '' && amount_paid != null) ? amount_paid : Math.round(total * 100) / 100;
  const orders = await readCsv('orders.csv');
  const newOrder = {
    order_number, user_name, product_id: 'MULTI', product_name: `Direct: ${names.join(', ')}`,
    quantity: String(units), amount_paid: String(amount), status: 'RFID_WRITTEN',
    rfid_card_uid: rfid_card_uid || '', written_payload: JSON.stringify(clean), created_at: nowIso(),
    written_at: '', verified_at: '', dispensed_at: '', frontend_id: '', notes: 'Direct multi-order'
  };
  orders.push(newOrder);
  await writeCsv('orders.csv', orders, orderHeaders);

  const customers = await readCsv('customers.csv');
  let customer = customers.find(c => c.user_name === user_name);
  if (!customer) { customer = { user_name, total_paid: '0', total_orders: '0', last_order_number: '', created_at: nowIso(), updated_at: nowIso() }; customers.push(customer); }
  customer.total_paid = String(toNumber(customer.total_paid) + toNumber(amount));
  customer.total_orders = String(toNumber(customer.total_orders) + 1);
  customer.last_order_number = order_number;
  customer.updated_at = nowIso();
  await writeCsv('customers.csv', customers, customerHeaders);

  return { order: newOrder, written_payload, total };
}

function summarizeMetrics(products, customers, orders, writerJobs, cards = []) {
  return {
    product_count: products.length,
    customer_count: customers.length,
    order_count: orders.length,
    pending_count: orders.filter(o => ['PENDING_WRITE','RFID_WRITTEN','VERIFIED'].includes(o.status)).length,
    completed_count: orders.filter(o => o.status === 'DISPENSED').length,
    low_stock_count: products.filter(p => p.is_low_stock).length,
    refill_count: products.filter(p => p.needs_refill).length,
    full_count: products.filter(p => p.is_full).length,
    inventory_units_total: products.reduce((sum, p) => sum + p.inventory, 0),
    capacity_total: products.reduce((sum, p) => sum + (p.max_capacity || 0), 0),
    total_revenue: orders.reduce((sum, o) => sum + toNumber(o.amount_paid), 0),
    writer_pending_count: writerJobs.filter(j => ['PENDING','CLAIMED'].includes(j.status)).length,
    writer_written_count: writerJobs.filter(j => j.status === 'WRITTEN').length,
    card_count: cards.length,
    card_balance_total: cards.reduce((sum, c) => sum + toNumber(c.balance), 0)
  };
}

async function upsertDeviceStatus(update) {
  const statuses = await readCsv('device_status.csv');
  let status = statuses.find(s => s.device_id === update.device_id);
  if (!status) {
    status = { device_id: update.device_id, device_type: update.device_type || '', server_connected: '', rfid_ready: '', card_present: '', last_card_uid: '', current_job_id: '', last_seen_at: '', message: '' };
    statuses.push(status);
  }
  Object.assign(status, update, { last_seen_at: nowIso() });
  await writeCsv('device_status.csv', statuses, deviceStatusHeaders);
  return status;
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'backend-center', time: nowIso() });
});

app.get('/api/dashboard', async (req, res, next) => {
  try {
    const [products, customers, orders, inventory_logs, devices, writer_jobs, device_status, cards, card_ledger] = await Promise.all([
      getProducts(), readCsv('customers.csv'), readCsv('orders.csv'), readCsv('inventory_log.csv'), readCsv('devices.csv'), readCsv('writer_jobs.csv'), readCsv('device_status.csv'), readCards(), readCsv('card_ledger.csv')
    ]);
    const metrics = summarizeMetrics(products, customers, orders, writer_jobs, cards);
    res.json({
      ok: true,
      metrics,
      products,
      customers: [...customers].sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || '')),
      recent_orders: [...orders].reverse().slice(0, 25),
      low_stock: products.filter(p => p.is_low_stock),
      recent_inventory_logs: [...inventory_logs].reverse().slice(0, 20),
      devices,
      writer_jobs: [...writer_jobs].reverse().slice(0, 20),
      writer_status: device_status.find(s => s.device_id === 'wio-rfid-writer') || null,
      device_status,
      cards: [...cards].sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || '')),
      card_ledger: [...card_ledger].reverse().slice(0, 20),
      local_tools: device.localToolsEnabled()
    });
  } catch (err) { next(err); }
});

app.get('/api/products', async (req, res, next) => {
  try { res.json({ ok: true, products: await getProducts() }); } catch (err) { next(err); }
});

app.post('/api/products/:productId/refill', async (req, res, next) => {
  try {
    const qty = toNumber(req.body.quantity, 0);
    if (qty <= 0) return res.status(400).json({ ok: false, error: 'quantity must be positive' });
    const rawProducts = await readProducts();
    const product = rawProducts.find(p => p.product_id === req.params.productId);
    if (!product) return res.status(404).json({ ok: false, error: 'product not found' });
    const maxCapacity = toNumber(product.max_capacity, 10) || 10;
    const current = toNumber(product.inventory);
    if (current + qty > maxCapacity) {
      return res.status(409).json({ ok: false, error: 'over_capacity', message: `Column ${product.slot_id || product.servo_id} holds at most ${maxCapacity}. It has ${current}; you can add ${Math.max(0, maxCapacity - current)} more.` });
    }
    product.inventory = String(current + qty);
    await writeProducts(rawProducts);
    await appendCsv('inventory_log.csv', { time: nowIso(), action: 'REFILL', product_id: product.product_id, product_name: product.product_name, quantity_delta: qty, inventory_after: product.inventory, actor: 'dashboard', notes: req.body.notes || '' }, inventoryLogHeaders);
    const [fresh] = (await getProducts()).filter(p => p.product_id === product.product_id);
    res.json({ ok: true, product: fresh || product });
  } catch (err) { next(err); }
});

// Initialize / set the exact number of products currently loaded in each column.
// Backs the operator "Initialize + Refill" page. Body: { items:[{product_id,count}] }.
app.post('/api/inventory/initialize', async (req, res, next) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (items.length === 0) return res.status(400).json({ ok: false, error: 'items array is required' });
    const rawProducts = await readProducts();
    const applied = [];
    for (const item of items) {
      const product = rawProducts.find(p => p.product_id === item.product_id);
      if (!product) continue;
      const maxCapacity = toNumber(product.max_capacity, 10) || 10;
      let count = Math.round(toNumber(item.count, 0));
      if (count < 0) count = 0;
      if (count > maxCapacity) count = maxCapacity;
      const before = toNumber(product.inventory);
      product.inventory = String(count);
      applied.push({ product_id: product.product_id, from: before, to: count });
      await appendCsv('inventory_log.csv', { time: nowIso(), action: 'INIT', product_id: product.product_id, product_name: product.product_name, quantity_delta: count - before, inventory_after: String(count), actor: 'operator', notes: 'initialize page' }, inventoryLogHeaders);
    }
    await writeProducts(rawProducts);
    res.json({ ok: true, applied, products: await getProducts() });
  } catch (err) { next(err); }
});

app.post('/api/orders/create-and-prepare-card', async (req, res, next) => {
  try {
    const { user_name, product_id, quantity = 1, amount_paid = '', rfid_card_uid = '', items } = req.body;
    if (!user_name) return res.status(400).json({ ok: false, error: 'user_name is required' });

    // items[] => multi-product direct order on one card; else single product.
    let result;
    if (Array.isArray(items) && items.some(it => toNumber(it.quantity ?? it.qty, 0) > 0)) {
      result = await createDirectMultiOrder({ user_name, items, amount_paid, rfid_card_uid });
    } else {
      if (!product_id) return res.status(400).json({ ok: false, error: 'product_id or items[] is required' });
      if (toNumber(quantity, 1) <= 0) return res.status(400).json({ ok: false, error: 'quantity must be greater than 0' });
      result = await createOrderRecord({ user_name, product_id, quantity, amount_paid, rfid_card_uid, status: 'RFID_WRITTEN', notes: 'Waiting for Wio RFID writer' });
    }
    const { order, written_payload } = result;

    const writerJobs = await readCsv('writer_jobs.csv');
    const writerJob = { job_id: `WJ-${nanoid(8).toUpperCase()}`, order_number: order.order_number, user_name, rfid_payload: written_payload, rfid_card_uid, status: 'PENDING', created_at: nowIso(), claimed_at: '', written_at: '', device_id: '', message: 'Waiting for card on Wio Terminal', job_type: 'ORDER' };
    writerJobs.push(writerJob);
    await writeCsv('writer_jobs.csv', writerJobs, writerJobHeaders);

    res.json({ ok: true, order, writer_job: writerJob, rfid_payload_to_write: written_payload, message: 'Order created. Wio RFID writer will write this when a card is present.' });
  } catch (err) { if (err.code) return res.status(err.code).json({ ok: false, error: err.message }); next(err); }
});

// WiFi flow: set/add a stored-value balance and queue a "selecting" card write.
// The Wio RFID writer writes {type:selecting,user_name} to the card; the balance
// itself lives here in cards.csv and is spent at the machine.
app.post('/api/cards/topup-and-prepare-card', async (req, res, next) => {
  try {
    const { user_name, amount, mode = 'add', card_uid = '' } = req.body;
    const amt = toNumber(amount, NaN);
    if (!user_name) return res.status(400).json({ ok: false, error: 'user_name is required' });
    if (!Number.isFinite(amt) || amt < 0) return res.status(400).json({ ok: false, error: 'amount must be a non-negative number' });
    if (!['add', 'set'].includes(mode)) return res.status(400).json({ ok: false, error: 'mode must be add or set' });

    const cards = await readCards();
    let card = cards.find(c => c.user_name === user_name);
    const current = card ? toNumber(card.balance) : 0;
    const newBalance = mode === 'set' ? amt : current + amt;
    if (!card) { card = { card_uid: card_uid || '', user_name, mode: 'SELECTING', balance: '0', status: 'ACTIVE', created_at: nowIso(), updated_at: '', last_payload: '', notes: '' }; cards.push(card); }
    card.balance = String(newBalance);
    card.mode = 'SELECTING';
    card.status = 'ACTIVE';
    card.updated_at = nowIso();
    if (card_uid) card.card_uid = card_uid;
    card.last_payload = makeBalancePayload(user_name);
    await writeCards(cards);
    await appendCsv('card_ledger.csv', { time: nowIso(), card_uid: card.card_uid || card_uid, user_name, type: mode === 'set' ? 'SET' : 'TOPUP', amount: String(amt), balance_after: String(newBalance), actor: 'operator', notes: 'queued for Wio writer' }, cardLedgerHeaders);

    const writerJobs = await readCsv('writer_jobs.csv');
    const writerJob = { job_id: `WJ-${nanoid(8).toUpperCase()}`, order_number: '', user_name, rfid_payload: makeBalancePayload(user_name), rfid_card_uid: card_uid, status: 'PENDING', created_at: nowIso(), claimed_at: '', written_at: '', device_id: '', message: 'Waiting for card on Wio writer', job_type: 'BALANCE' };
    writerJobs.push(writerJob);
    await writeCsv('writer_jobs.csv', writerJobs, writerJobHeaders);

    res.json({ ok: true, card, writer_job: writerJob, balance: newBalance, rfid_payload_to_write: writerJob.rfid_payload, message: 'Balance updated. Present a card on the Wio writer to encode the selecting card.' });
  } catch (err) { next(err); }
});

// Local USB flow: reserve stock, create order, and write the card synchronously.
app.post('/api/orders/create-and-write', requireLocalTools, async (req, res, next) => {
  try {
    const { user_name, product_id, quantity = 1, amount_paid = '' } = req.body;
    if (!user_name || !product_id) return res.status(400).json({ ok: false, error: 'user_name and product_id are required' });
    if (toNumber(quantity, 1) <= 0) return res.status(400).json({ ok: false, error: 'quantity must be greater than 0' });

    const { order, written_payload } = await createOrderRecord({ user_name, product_id, quantity, amount_paid, status: 'PENDING_WRITE', notes: 'Writing via USB' });

    const write = await device.serialWrite(written_payload);

    const orders = await readCsv('orders.csv');
    const ord = orders.find(o => o.order_number === order.order_number);
    if (ord) {
      if (write.ok) { ord.status = 'RFID_WRITTEN'; ord.written_at = nowIso(); ord.rfid_card_uid = write.uid || ''; ord.notes = 'RFID card written via USB'; }
      else { ord.status = 'WRITE_FAILED'; ord.notes = write.error || 'USB write failed'; }
      await writeCsv('orders.csv', orders, orderHeaders);
    }

    const writerJobs = await readCsv('writer_jobs.csv');
    const writerJob = { job_id: `WJ-${nanoid(8).toUpperCase()}`, order_number: order.order_number, user_name, rfid_payload: written_payload, rfid_card_uid: write.uid || '', status: write.ok ? 'WRITTEN' : 'FAILED', created_at: nowIso(), claimed_at: nowIso(), written_at: write.ok ? nowIso() : '', device_id: 'xiao-usb-writer', message: write.ok ? 'Written via USB' : (write.error || 'USB write failed'), job_type: 'ORDER' };
    writerJobs.push(writerJob);
    await writeCsv('writer_jobs.csv', writerJobs, writerJobHeaders);

    if (!write.ok) return res.status(502).json({ ok: false, error: 'card_write_failed', message: friendlyCardError(write), detail: write.error || '', order: ord, writer_job: writerJob, log: write.raw || '' });
    res.json({ ok: true, order: ord, writer_job: writerJob, rfid_card_uid: write.uid || '', payload: JSON.parse(written_payload), message: 'Order created and RFID card written.' });
  } catch (err) { if (err.code) return res.status(err.code).json({ ok: false, error: err.message }); next(err); }
});

// Local USB flow: write a stored-value balance to the card + record the ledger.
app.post('/api/cards/topup-and-write', requireLocalTools, async (req, res, next) => {
  try {
    const { user_name, amount, mode = 'add', card_uid = '' } = req.body;
    const amt = toNumber(amount, NaN);
    if (!user_name) return res.status(400).json({ ok: false, error: 'user_name is required' });
    if (!Number.isFinite(amt) || amt < 0) return res.status(400).json({ ok: false, error: 'amount must be a non-negative number' });
    if (!['add', 'set'].includes(mode)) return res.status(400).json({ ok: false, error: 'mode must be add or set' });

    const cards = await readCards();
    let uid = String(card_uid || '').trim();
    let currentBalance = 0;

    if (mode === 'add') {
      if (uid) {
        const existing = cards.find(c => c.card_uid === uid);
        currentBalance = existing ? toNumber(existing.balance) : 0;
      } else {
        const read = await device.serialRead();
        if (!read.ok || !read.uid) return res.status(502).json({ ok: false, error: 'card_read_failed', message: friendlyCardError(read), detail: read.error || 'no card detected', log: read.raw || '' });
        uid = read.uid;
        const onCard = parseBalanceFromPayload(read.payload);
        const existing = cards.find(c => c.card_uid === uid);
        currentBalance = onCard != null ? onCard : (existing ? toNumber(existing.balance) : 0);
      }
    }

    const newBalance = mode === 'set' ? amt : currentBalance + amt;
    const payload = JSON.stringify({ user_name, balance: newBalance, v: 1 });
    if (payload.length > 96) return res.status(400).json({ ok: false, error: 'payload_too_long', message: 'Shorten user_name; only 96 bytes fit on the card.' });

    const write = await device.serialWrite(payload);
    if (!write.ok) return res.status(502).json({ ok: false, error: 'card_write_failed', message: friendlyCardError(write), detail: write.error || '', log: write.raw || '' });
    uid = write.uid || uid || 'UNKNOWN';

    let card = cards.find(c => c.card_uid === uid);
    if (!card) { card = { card_uid: uid, user_name, mode: 'DIRECT', balance: '0', status: 'ACTIVE', created_at: nowIso(), updated_at: '', last_payload: '', notes: '' }; cards.push(card); }
    card.user_name = user_name;
    card.balance = String(newBalance);
    card.status = 'ACTIVE';
    card.updated_at = nowIso();
    card.last_payload = payload;
    await writeCards(cards);

    await appendCsv('card_ledger.csv', { time: nowIso(), card_uid: uid, user_name, type: mode === 'set' ? 'SET' : 'TOPUP', amount: String(amt), balance_after: String(newBalance), actor: 'operator', notes: '' }, cardLedgerHeaders);

    res.json({ ok: true, card, rfid_card_uid: uid, balance: newBalance, payload: JSON.parse(payload), message: 'Balance written to card.' });
  } catch (err) { if (err.code) return res.status(err.code).json({ ok: false, error: err.message }); next(err); }
});

// ---- Local device (USB) endpoints ----
app.get('/api/device/status', async (req, res, next) => {
  try {
    if (!device.localToolsEnabled()) return res.json({ ok: true, local_tools: false, connected: false, message: 'Local device tools disabled' });
    const status = await device.getStatus({ probe: req.query.probe === '1' });
    res.json({ ok: true, local_tools: true, ...status });
  } catch (err) { next(err); }
});

// Connection status of the backend Wio RFID writer (WiFi heartbeat). Backs the
// Writer Config page. Considered online if a heartbeat arrived in the last 15s.
app.get('/api/device/writer-status', async (req, res, next) => {
  try {
    const [statuses, jobs] = await Promise.all([readCsv('device_status.csv'), readCsv('writer_jobs.csv')]);
    const status = statuses.find(s => s.device_id === 'wio-rfid-writer') || null;
    let online = false;
    let seconds_since_seen = null;
    if (status && status.last_seen_at) {
      const delta = Date.now() - new Date(status.last_seen_at).getTime();
      seconds_since_seen = Math.round(delta / 1000);
      online = delta < 15000;
    }
    res.json({ ok: true, status, online, seconds_since_seen, pending_jobs: jobs.filter(j => ['PENDING', 'CLAIMED'].includes(j.status)).length });
  } catch (err) { next(err); }
});

// ---- Wio Terminal setup (Config page): detect, set WiFi, flash via arduino-cli ----
app.get('/api/wio/status', async (req, res, next) => {
  try {
    const [wioStatus, writerStatuses] = await Promise.all([wio.status(), readCsv('device_status.csv')]);
    // Attach the live heartbeat for the writer so the card can show WiFi/runtime.
    const writer = writerStatuses.find(s => s.device_id === 'wio-rfid-writer') || null;
    let writer_online = false;
    if (writer && writer.last_seen_at) writer_online = (Date.now() - new Date(writer.last_seen_at).getTime()) < 15000;
    res.json({ ok: true, ...wioStatus, writer_runtime: { status: writer, online: writer_online } });
  } catch (err) { next(err); }
});

// Save WiFi (and backend URL) into a target sketch, ready to flash. No upload here.
app.post('/api/wio/wifi', async (req, res, next) => {
  try {
    const { target, ssid, password, backend_url } = req.body;
    if (!WIO_TARGET_KEYS.includes(target)) return res.status(400).json({ ok: false, error: 'target must be frontend or writer' });
    const config = await wio.writeConfig(target, { ssid, password, backend_url });
    res.json({ ok: true, config, message: 'Settings saved to the sketch. Flash to apply.' });
  } catch (err) { res.status(400).json({ ok: false, error: err.message }); }
});

// Compile + upload a target sketch to a connected Wio Terminal.
app.post('/api/wio/flash', async (req, res, next) => {
  try {
    const { target, port } = req.body;
    if (!WIO_TARGET_KEYS.includes(target)) return res.status(400).json({ ok: false, error: 'target must be frontend or writer' });
    if (!port) return res.status(400).json({ ok: false, error: 'port is required (pick a connected Wio Terminal)' });
    if (!(await wio.hasArduinoCli())) return res.status(501).json({ ok: false, error: 'arduino_cli_missing', message: 'arduino-cli was not found. Run backend-full locally (with arduino-cli installed) and the Wio connected by USB.' });
    const result = await wio.flash(target, port);
    res.status(result.ok ? 200 : 500).json({ ok: result.ok, port: result.port, target: result.target, log: result.log, message: result.ok ? 'Upload complete.' : 'Flash failed - see log.' });
  } catch (err) { res.status(400).json({ ok: false, error: err.message }); }
});

app.post('/api/device/flash', requireLocalTools, async (req, res, next) => {
  try {
    const result = await device.flash();
    res.status(result.ok ? 200 : 500).json({ ok: result.ok, log: result.log, port: result.port || null });
  } catch (err) { next(err); }
});

app.post('/api/cards/read', requireLocalTools, async (req, res, next) => {
  try {
    const port = await device.detectPort({ fresh: true });
    if (!port) return res.json({ ok: false, error: 'no_device', message: 'No XIAO detected on USB. Open Device Setup to connect or flash.' });
    const read = await device.serialRead(port);
    if (read.ok && read.uid) {
      return res.json({ ok: true, present: true, uid: read.uid, payload: read.payload || null, balance: parseBalanceFromPayload(read.payload) });
    }
    if (/No card detected/i.test(read.raw || '')) {
      return res.json({ ok: true, present: false, uid: null, message: 'No card detected. Place the card flat on the reader and keep it there, then Read again.' });
    }
    return res.json({ ok: false, error: read.error || 'read_failed', message: friendlyCardError(read), raw: read.raw || '' });
  } catch (err) { next(err); }
});

app.post('/api/rfid-writer/status', requireDevice, async (req, res, next) => {
  try {
    if (req.device.device_type !== 'writer') return res.status(403).json({ ok: false, error: 'device is not a writer' });
    const status = await upsertDeviceStatus({
      device_id: req.device.device_id,
      device_type: 'writer',
      server_connected: 'true',
      rfid_ready: String(Boolean(req.body.rfid_ready)),
      card_present: String(Boolean(req.body.card_present)),
      last_card_uid: req.body.last_card_uid || '',
      current_job_id: req.body.current_job_id || '',
      message: req.body.message || ''
    });
    res.json({ ok: true, status, server_time: nowIso() });
  } catch (err) { next(err); }
});

app.get('/api/rfid-writer/next-job', requireDevice, async (req, res, next) => {
  try {
    if (req.device.device_type !== 'writer') return res.status(403).json({ ok: false, error: 'device is not a writer' });
    const jobs = await readCsv('writer_jobs.csv');
    let job = jobs.find(j => j.status === 'CLAIMED' && j.device_id === req.device.device_id) || jobs.find(j => j.status === 'PENDING');
    if (!job) return res.json({ ok: true, has_job: false, message: 'No pending RFID write job' });
    if (job.status === 'PENDING') {
      job.status = 'CLAIMED';
      job.claimed_at = nowIso();
      job.device_id = req.device.device_id;
      job.message = 'Claimed by Wio RFID writer';
      await writeCsv('writer_jobs.csv', jobs, writerJobHeaders);
    }
    res.json({ ok: true, has_job: true, job });
  } catch (err) { next(err); }
});

app.post('/api/rfid-writer/job-result', requireDevice, async (req, res, next) => {
  try {
    if (req.device.device_type !== 'writer') return res.status(403).json({ ok: false, error: 'device is not a writer' });
    const { job_id, success, rfid_card_uid = '', message = '' } = req.body;
    const jobs = await readCsv('writer_jobs.csv');
    const job = jobs.find(j => j.job_id === job_id);
    if (!job) return res.status(404).json({ ok: false, error: 'writer job not found' });
    job.status = success ? 'WRITTEN' : 'FAILED';
    job.written_at = success ? nowIso() : '';
    job.device_id = req.device.device_id;
    job.rfid_card_uid = rfid_card_uid || job.rfid_card_uid;
    job.message = message || (success ? 'RFID card written successfully' : 'RFID card write failed');
    await writeCsv('writer_jobs.csv', jobs, writerJobHeaders);

    const orders = await readCsv('orders.csv');
    const order = orders.find(o => o.order_number === job.order_number);
    if (order) {
      if (success) {
        order.written_at = nowIso();
        order.rfid_card_uid = rfid_card_uid || order.rfid_card_uid;
        order.notes = 'RFID card written by Wio Terminal';
      } else {
        order.notes = `RFID writer failed: ${job.message}`;
      }
      await writeCsv('orders.csv', orders, orderHeaders);
    }
    await upsertDeviceStatus({ device_id: req.device.device_id, device_type: 'writer', server_connected: 'true', rfid_ready: 'true', card_present: rfid_card_uid ? 'true' : '', last_card_uid: rfid_card_uid, current_job_id: '', message: job.message });
    res.json({ ok: true, job, order });
  } catch (err) { next(err); }
});

// Permission gate for the frontend Wio. Handles both card types:
//   direct    -> validate a pre-created order, deduct stock, return one servo move.
//   selecting -> return the card balance + per-column data for on-screen selection.
app.post('/api/frontend/verify-card', requireDevice, async (req, res, next) => {
  try {
    const type = String(req.body.type || 'direct').toLowerCase();

    if (type === 'selecting') {
      const { user_name } = req.body;
      if (!user_name) return res.status(400).json({ ok: false, allow_dispense: false, error: 'user_name required' });
      const cards = await readCards();
      const card = cards.find(c => c.user_name === user_name && String(c.status || 'ACTIVE') !== 'DISABLED');
      if (!card) return res.status(404).json({ ok: false, allow_dispense: false, error: 'card not found' });
      const arrays = servoIndexedArrays(await readProducts());
      return res.json({ ok: true, allow_dispense: true, type: 'selecting', user_name, balance: toNumber(card.balance), servo: arrays.servo, name: arrays.name, price: arrays.price, stock: arrays.stock, needs_refill: arrays.needs_refill, active: arrays.active, message: 'Card verified. Select products on the machine.' });
    }

    // ---- direct (single or multi-product) ----
    const { user_name, order_number, rfid_card_uid = '' } = req.body;
    const orders = await readCsv('orders.csv');
    const order = orders.find(o => o.user_name === user_name && o.order_number === order_number);
    if (!order) return res.status(404).json({ ok: false, allow_dispense: false, error: 'order not found' });
    if (order.status === 'DISPENSED') return res.status(409).json({ ok: false, allow_dispense: false, error: 'order already used' });
    if (!validOrderStartStates.has(order.status)) return res.status(409).json({ ok: false, allow_dispense: false, error: `invalid order status: ${order.status}` });

    const items = orderItems(order);
    const rawProducts = await readProducts();
    // Validate every line item before deducting anything.
    for (const it of items) {
      const product = rawProducts.find(p => p.product_id === it.product_id);
      if (!product || String(product.active) !== 'true') return res.status(409).json({ ok: false, allow_dispense: false, error: 'product unavailable' });
      if (toNumber(product.inventory) < toNumber(it.qty)) {
        order.notes = 'Blocked at machine: needs refill';
        await writeCsv('orders.csv', orders, orderHeaders);
        return res.status(409).json({ ok: false, allow_dispense: false, error: 'needs_refill', message: `${product.product_name} (column ${product.slot_id || product.servo_id}) needs refill. See staff.` });
      }
    }
    // Deduct all items now (authorize step); dispense-complete(false) rolls back.
    // times[] is per-servo (1..4) dispense counts for the frontend.
    const times = [0, 0, 0, 0];
    for (const it of items) {
      const product = rawProducts.find(p => p.product_id === it.product_id);
      const s = toNumber(product.servo_id);
      if (s >= 1 && s <= 4) times[s - 1] += toNumber(it.qty);
      product.inventory = String(toNumber(product.inventory) - toNumber(it.qty));
      await appendCsv('inventory_log.csv', { time: nowIso(), action: 'DISPENSE', product_id: product.product_id, product_name: product.product_name, quantity_delta: -toNumber(it.qty), inventory_after: product.inventory, actor: req.device.device_id, notes: order.order_number }, inventoryLogHeaders);
    }
    await writeProducts(rawProducts);

    order.status = 'VERIFIED';
    order.verified_at = nowIso();
    order.frontend_id = req.device.device_id;
    if (rfid_card_uid) order.rfid_card_uid = rfid_card_uid;
    await writeCsv('orders.csv', orders, orderHeaders);

    // Back-compat single fields (first item) + per-servo times[] for multi.
    const first = items[0];
    const firstProduct = rawProducts.find(p => p.product_id === first.product_id) || {};
    res.json({ ok: true, allow_dispense: true, type: 'direct', order_number: order.order_number, product_name: order.product_name, servo_id: firstProduct.servo_id || '', quantity: toNumber(first.qty, 1), times, message: 'Card verified. Dispensing now.' });
  } catch (err) { next(err); }
});

// Selecting checkout: the customer picked items on the machine. items is a
// 4-length array of quantities indexed by servo id 1..4. Validates stock +
// balance, deducts both, and returns the servo dispense plan.
app.post('/api/frontend/selecting/checkout', requireDevice, async (req, res, next) => {
  try {
    const { user_name, rfid_card_uid = '' } = req.body;
    const items = Array.isArray(req.body.items) ? req.body.items.map(n => Math.max(0, Math.round(toNumber(n, 0)))) : [];
    if (!user_name) return res.status(400).json({ ok: false, allow_dispense: false, error: 'user_name required' });
    if (items.length === 0 || items.every(q => q <= 0)) return res.status(400).json({ ok: false, allow_dispense: false, error: 'no items selected' });

    const cards = await readCards();
    const card = cards.find(c => c.user_name === user_name && String(c.status || 'ACTIVE') !== 'DISABLED');
    if (!card) return res.status(404).json({ ok: false, allow_dispense: false, error: 'card not found' });

    const rawProducts = await readProducts();
    const bySrv = {};
    for (const p of rawProducts) { const s = toNumber(p.servo_id); if (s >= 1 && s <= 4) bySrv[s] = p; }

    let total = 0;
    const plan = [];
    const purchased = [];
    for (let i = 0; i < items.length && i < 4; i++) {
      const qty = items[i];
      if (qty <= 0) continue;
      const product = bySrv[i + 1];
      if (!product || String(product.active) !== 'true') return res.status(409).json({ ok: false, allow_dispense: false, error: `servo ${i + 1} unavailable` });
      if (toNumber(product.inventory) < qty) return res.status(409).json({ ok: false, allow_dispense: false, error: 'needs_refill', message: `${product.product_name} needs refill.` });
      total += toNumber(product.price) * qty;
      plan.push({ servo_id: i + 1, times: qty });
      purchased.push({ product_id: product.product_id, qty });
    }
    const balance = toNumber(card.balance);
    if (total > balance) return res.status(402).json({ ok: false, allow_dispense: false, error: 'insufficient_balance', message: `Balance ${balance.toFixed(2)} is less than cost ${total.toFixed(2)}.` });

    for (const item of purchased) {
      const product = rawProducts.find(p => p.product_id === item.product_id);
      product.inventory = String(toNumber(product.inventory) - item.qty);
      await appendCsv('inventory_log.csv', { time: nowIso(), action: 'DISPENSE', product_id: product.product_id, product_name: product.product_name, quantity_delta: -item.qty, inventory_after: product.inventory, actor: req.device.device_id, notes: 'selecting' }, inventoryLogHeaders);
    }
    await writeProducts(rawProducts);

    const newBalance = balance - total;
    card.balance = String(newBalance);
    card.status = 'ACTIVE';
    card.updated_at = nowIso();
    if (rfid_card_uid && !card.card_uid) card.card_uid = rfid_card_uid;
    await writeCards(cards);
    await appendCsv('card_ledger.csv', { time: nowIso(), card_uid: card.card_uid || rfid_card_uid, user_name, type: 'PURCHASE', amount: String(total), balance_after: String(newBalance), actor: req.device.device_id, notes: purchased.map(x => `${x.product_id}x${x.qty}`).join(' ') }, cardLedgerHeaders);

    const order_number = makeOrderNumber();
    const summary = purchased.map(x => `${x.product_id}x${x.qty}`).join(' ');
    const orders = await readCsv('orders.csv');
    orders.push({ order_number, user_name, product_id: 'SELECT', product_name: `Selecting: ${summary}`, quantity: String(purchased.reduce((s, x) => s + x.qty, 0)), amount_paid: String(total), status: 'VERIFIED', rfid_card_uid: rfid_card_uid || card.card_uid || '', written_payload: JSON.stringify(purchased), created_at: nowIso(), written_at: '', verified_at: nowIso(), dispensed_at: '', frontend_id: req.device.device_id, notes: 'selecting checkout' });
    await writeCsv('orders.csv', orders, orderHeaders);

    const customers = await readCsv('customers.csv');
    let customer = customers.find(c => c.user_name === user_name);
    if (!customer) { customer = { user_name, total_paid: '0', total_orders: '0', last_order_number: '', created_at: nowIso(), updated_at: nowIso() }; customers.push(customer); }
    customer.total_paid = String(toNumber(customer.total_paid) + total);
    customer.total_orders = String(toNumber(customer.total_orders) + 1);
    customer.last_order_number = order_number;
    customer.updated_at = nowIso();
    await writeCsv('customers.csv', customers, customerHeaders);

    res.json({ ok: true, allow_dispense: true, type: 'selecting', order_number, plan, total, new_balance: newBalance, message: 'Approved. Dispensing now.' });
  } catch (err) { next(err); }
});

app.post('/api/frontend/dispense-complete', requireDevice, async (req, res, next) => {
  try {
    const { order_number, success, notes = '' } = req.body;
    const orders = await readCsv('orders.csv');
    const order = orders.find(o => o.order_number === order_number);
    if (!order) return res.status(404).json({ ok: false, error: 'order not found' });
    if (order.status !== 'DISPENSED') {
      if (success) {
        order.status = 'DISPENSED';
      } else {
        order.status = 'DISPENSE_FAILED';
        // Stock (and balance for selecting) was taken at the authorize step.
        await rollbackOrder(order, req.device.device_id);
      }
      order.dispensed_at = nowIso();
      order.frontend_id = req.device.device_id;
      order.notes = notes || order.notes;
      await writeCsv('orders.csv', orders, orderHeaders);
    }
    res.json({ ok: true, order, message: success ? 'Order completed.' : 'Dispense failed. Stock/balance rolled back.' });
  } catch (err) { next(err); }
});

app.post('/api/orders/:orderNumber/cancel', async (req, res, next) => {
  try {
    const orders = await readCsv('orders.csv');
    const order = orders.find(o => o.order_number === req.params.orderNumber);
    if (!order) return res.status(404).json({ ok: false, error: 'order not found' });
    if (order.status === 'DISPENSED') return res.status(409).json({ ok: false, error: 'cannot cancel dispensed order' });
    if (order.status !== 'CANCELLED') {
      // Stock is only ever removed at the authorize step (VERIFIED). A pending
      // write / written card never held stock, so nothing to release for those.
      if (order.status === 'VERIFIED') await rollbackOrder(order, 'dashboard-cancel');
      order.status = 'CANCELLED';
      order.notes = `${order.notes || ''}${order.notes ? ' | ' : ''}Cancelled from dashboard`;
      await writeCsv('orders.csv', orders, orderHeaders);
      const jobs = await readCsv('writer_jobs.csv');
      let changed = false;
      for (const job of jobs) {
        if (job.order_number === order.order_number && ['PENDING','CLAIMED','FAILED'].includes(job.status)) { job.status = 'CANCELLED'; job.message = 'Order cancelled'; changed = true; }
      }
      if (changed) await writeCsv('writer_jobs.csv', jobs, writerJobHeaders);
    }
    res.json({ ok: true, order });
  } catch (err) { next(err); }
});

app.use((req, res) => { res.sendFile(path.resolve('public/index.html')); });
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ ok: false, error: err.message }); });
app.listen(PORT, () => { console.log(`backend-center running at http://localhost:${PORT}`); });
