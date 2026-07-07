const state = { dashboard: null, cart: {}, mode: 'product', writer: null };
const $ = (id) => document.getElementById(id);

async function api(path, opts = {}) {
  const response = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const data = await response.json();
  if (!response.ok || data.ok === false) throw new Error(data.message || data.error || data.detail || 'Request failed');
  return data;
}
function money(value) { return `$${Number(value || 0).toFixed(2)}`; }
function statusClass(status) { return `<span class="status ${status}">${status}</span>`; }
function stockBadge(product) {
  if (product.inventory <= 0) return '<span class="stock-pill out">Empty</span>';
  if (product.needs_refill) return '<span class="stock-pill low">Refill soon</span>';
  if (product.is_full) return '<span class="stock-pill ok">Full</span>';
  return '<span class="stock-pill ok">In stock</span>';
}
function showToast(message) {
  const toast = $('toast'); toast.textContent = message; toast.classList.remove('hidden');
  clearTimeout(showToast._timer); showToast._timer = setTimeout(() => toast.classList.add('hidden'), 3200);
}
function productById(id) { return state.dashboard?.products?.find(item => item.product_id === id) || null; }
function tableHead(cols) { return '<tr>' + cols.map(col => `<th>${col}</th>`).join('') + '</tr>'; }

// ---------------- Writer banner (Wio WiFi writer) ----------------
async function pollWriter() {
  try { state.writer = await api('/api/device/writer-status'); }
  catch { state.writer = null; }
  renderWriterBanner();
}
function renderWriterBanner() {
  const w = state.writer; const banner = $('writerBanner');
  if (!w || !w.status) {
    banner.className = 'banner warn';
    banner.innerHTML = 'Wio RFID writer offline. <a class="text-link" href="/config.html">Open Config</a> to set its WiFi and flash it.';
    return;
  }
  if (w.online) {
    const rfid = w.status.rfid_ready === 'true' ? 'RFID ready' : 'RFID not answering';
    banner.className = 'banner ok';
    banner.innerHTML = `Wio RFID writer online - ${rfid}. Pending card writes: <strong>${w.pending_jobs}</strong>.`;
  } else {
    banner.className = 'banner warn';
    banner.innerHTML = `Wio RFID writer offline (last seen ${w.seconds_since_seen != null ? w.seconds_since_seen + 's ago' : 'never'}). <a class="text-link" href="/config.html">Open Config</a>`;
  }
}

// ---------------- Refill / capacity alerts ----------------
function renderAlerts() {
  const products = state.dashboard.products || [];
  const refill = products.filter(p => p.needs_refill || p.inventory <= 0);
  const banner = $('alertBanner');
  if (!refill.length) { banner.classList.add('hidden'); return; }
  banner.classList.remove('hidden');
  banner.className = 'banner warn';
  banner.innerHTML = `<strong>Needs refill:</strong> ${refill.map(p => `${p.product_name} (${p.inventory}/${p.max_capacity})`).join(', ')} &nbsp; <a class="text-link" href="/inventory.html">Refill now</a>`;
}

// ---------------- Metrics ----------------
function renderMetrics() {
  const m = state.dashboard.metrics;
  const cards = [
    ['Units Loaded', `${m.inventory_units_total}/${m.capacity_total}`, 'Stock vs capacity'],
    ['Needs Refill', m.refill_count, 'Columns at/below threshold'],
    ['Card Balance', money(m.card_balance_total), 'Total stored value'],
    ['Pending Writes', m.writer_pending_count, 'Cards waiting for the writer']
  ];
  $('metrics').innerHTML = cards.map(([label, value, sub]) => `<article class="metric-card"><div class="metric-label">${label}</div><div class="metric-value">${value}</div><div class="metric-sub">${sub}</div></article>`).join('');
}

// ---------------- Mode ----------------
function setMode(mode) {
  state.mode = mode;
  [...document.querySelectorAll('.mode-tab')].forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
  $('productPane').classList.toggle('hidden', mode !== 'product');
  $('balancePane').classList.toggle('hidden', mode !== 'balance');
}

// ---------------- Products ----------------
function cartQty(id) { return Math.max(0, Number(state.cart[id] || 0)); }
function maxOf(id) { const p = productById(id); return p ? p.max_capacity : 10; }
function setCartQty(id, qty) {
  let q = Math.round(Number(qty) || 0);
  if (q < 0) q = 0;
  const m = maxOf(id); if (q > m) q = m;
  state.cart[id] = q;
}
function afterCartChange() { renderProducts(); renderCartSummary(); }
function renderProducts() {
  const products = state.dashboard.products;
  $('productGrid').innerHTML = products.map(p => {
    const q = cartQty(p.product_id);
    return `<article class="product-card ${q > 0 ? 'has-qty' : ''}" data-product-id="${p.product_id}"><div class="product-image-wrap"><img src="${p.image_path}" alt="${p.product_name}" /></div><div class="product-card-body"><div class="card-head"><div><div class="tag">${p.tag}</div><h3>${p.product_name}</h3></div><div class="price">${money(p.price)}</div></div><div class="stock-row">${stockBadge(p)}<span>${p.inventory}/${p.max_capacity} - servo ${p.servo_id}</span></div><div class="qty-stepper"><button class="secondary qbtn" data-qminus="${p.product_id}">-</button><input class="qty-input" id="qty_${p.product_id}" type="number" min="0" max="${p.max_capacity}" value="${q}" data-qty="${p.product_id}" /><button class="secondary qbtn" data-qplus="${p.product_id}">+</button></div></div></article>`;
  }).join('');
  [...document.querySelectorAll('[data-qplus]')].forEach(b => b.addEventListener('click', () => { const id = b.dataset.qplus; setCartQty(id, cartQty(id) + 1); afterCartChange(); }));
  [...document.querySelectorAll('[data-qminus]')].forEach(b => b.addEventListener('click', () => { const id = b.dataset.qminus; setCartQty(id, cartQty(id) - 1); afterCartChange(); }));
  [...document.querySelectorAll('[data-qty]')].forEach(inp => inp.addEventListener('change', () => { setCartQty(inp.dataset.qty, inp.value); afterCartChange(); }));
}
function renderCartSummary() {
  const products = state.dashboard.products || [];
  const lines = products.filter(p => cartQty(p.product_id) > 0);
  const box = $('cartSummary');
  if (!lines.length) { box.className = 'selected-card empty-state'; box.style.display = ''; box.innerHTML = 'Set a quantity on one or more products.'; $('amount_paid').placeholder = 'auto = sum of prices'; return; }
  const total = lines.reduce((s, p) => s + p.price * cartQty(p.product_id), 0);
  box.className = 'selected-card'; box.style.display = 'block';
  box.innerHTML = `<div class="tag">Card contents</div><ul class="cart-lines">${lines.map(p => `<li><span>${p.product_name} &times;${cartQty(p.product_id)}</span><span>${money(p.price * cartQty(p.product_id))}</span></li>`).join('')}</ul><div class="cart-total">Total ${money(total)}</div>`;
  $('amount_paid').placeholder = `auto = ${money(total)}`;
}

// ---------------- Result box ----------------
function renderResult(title, obj, steps) {
  $('payloadOutput').textContent = `${title}\n` + JSON.stringify(obj, null, 2);
  $('writerSteps').innerHTML = (steps || []).map(s => `<li>${s}</li>`).join('');
}

// ---------------- Actions ----------------
async function createOrder() {
  const products = state.dashboard.products || [];
  const items = products.filter(p => cartQty(p.product_id) > 0).map(p => ({ product_id: p.product_id, quantity: cartQty(p.product_id) }));
  if (!items.length) return showToast('Set a quantity on at least one product.');
  const user_name = $('user_name').value.trim();
  if (!user_name) return showToast('user_name is required.');
  const body = { user_name, items, amount_paid: $('amount_paid').value };
  const btn = $('createOrderButton'); const label = btn.textContent; btn.disabled = true; btn.textContent = 'Queuing...';
  try {
    const data = await api('/api/orders/create-and-prepare-card', { method: 'POST', body: JSON.stringify(body) });
    renderResult('Direct order card queued', { order_number: data.order.order_number, products: data.order.product_name, payload: JSON.parse(data.rfid_payload_to_write) }, ['Order created (stock deducted at collection).', 'Present a blank card on the Wio writer to encode it.', 'The machine dispenses all these products from this one card.']);
    showToast(`Order ${data.order.order_number} queued.`);
    state.cart = {}; $('user_name').value = ''; $('amount_paid').value = '';
    await load();
  } catch (e) { showToast(e.message); renderResult('Order failed', { error: e.message }, []); }
  finally { btn.disabled = false; btn.textContent = label; }
}

async function writeBalance() {
  const body = { user_name: $('bal_user_name').value.trim(), amount: $('bal_amount').value, mode: $('bal_mode').value };
  if (!body.user_name) return showToast('user_name is required.');
  if (!(Number(body.amount) >= 0)) return showToast('Enter a valid amount.');
  const btn = $('writeBalanceButton'); const label = btn.textContent; btn.disabled = true; btn.textContent = 'Queuing...';
  try {
    const data = await api('/api/cards/topup-and-prepare-card', { method: 'POST', body: JSON.stringify(body) });
    renderResult('Selecting balance card queued', { user_name: data.card.user_name, new_balance: data.balance, payload: JSON.parse(data.rfid_payload_to_write) }, ['Balance updated in the backend.', 'Present a blank card on the Wio writer to encode the selecting card.']);
    showToast(`Balance ${money(data.balance)} set for ${data.card.user_name}.`);
    $('bal_amount').value = '';
    await load();
  } catch (e) { showToast(e.message); renderResult('Balance update failed', { error: e.message }, []); }
  finally { btn.disabled = false; btn.textContent = label; }
}

// ---------------- Tables ----------------
function renderOrdersTable() {
  const orders = (state.dashboard.recent_orders || []).slice(0, 8);
  $('ordersTable').innerHTML = tableHead(['Order', 'User', 'Product', 'Qty', 'Status']) + (orders.length ? orders.map(o => `<tr><td><strong>${o.order_number}</strong></td><td>${o.user_name}</td><td>${o.product_name}</td><td>${o.quantity}</td><td>${statusClass(o.status)}</td></tr>`).join('') : `<tr><td colspan="5" class="hint">No orders yet.</td></tr>`);
}
function renderCardsTable() {
  const cards = (state.dashboard.cards || []).slice(0, 8);
  $('cardsTable').innerHTML = tableHead(['User', 'Balance', 'Card UID', 'Updated']) + (cards.length ? cards.map(c => `<tr><td><strong>${c.user_name || '-'}</strong></td><td>${money(c.balance)}</td><td>${c.card_uid || '-'}</td><td>${c.updated_at || ''}</td></tr>`).join('') : `<tr><td colspan="4" class="hint">No balance cards yet.</td></tr>`);
}
function renderWriterJobsTable() {
  const jobs = (state.dashboard.writer_jobs || []).slice(0, 8);
  $('writerJobsTable').innerHTML = tableHead(['Type', 'User', 'Order', 'Status', 'Message']) + (jobs.length ? jobs.map(j => `<tr><td>${j.job_type || 'ORDER'}</td><td>${j.user_name}</td><td>${j.order_number || '-'}</td><td>${statusClass(j.status)}</td><td>${j.message || ''}</td></tr>`).join('') : `<tr><td colspan="5" class="hint">No card writes yet.</td></tr>`);
}

function renderQuickAmounts() {
  $('quickAmounts').innerHTML = [10, 20, 50, 100].map(v => `<button class="secondary chip" data-amount="${v}">+${money(v)}</button>`).join('');
  [...document.querySelectorAll('#quickAmounts [data-amount]')].forEach(b => b.addEventListener('click', () => { $('bal_amount').value = b.dataset.amount; }));
}

async function load() {
  const data = await api('/api/dashboard'); state.dashboard = data;
  renderAlerts(); renderMetrics(); renderProducts(); renderCartSummary(); renderOrdersTable(); renderCardsTable(); renderWriterJobsTable();
}

// ---------------- Wire up ----------------
$('refreshButton').addEventListener('click', () => { load().catch(e => showToast(e.message)); pollWriter(); });
[...document.querySelectorAll('.mode-tab')].forEach(t => t.addEventListener('click', () => setMode(t.dataset.mode)));
$('createOrderButton').addEventListener('click', createOrder);
$('writeBalanceButton').addEventListener('click', writeBalance);

renderQuickAmounts();
load().catch(e => showToast(e.message));
pollWriter();
setInterval(() => load().catch(() => {}), 6000);
setInterval(pollWriter, 4000);
