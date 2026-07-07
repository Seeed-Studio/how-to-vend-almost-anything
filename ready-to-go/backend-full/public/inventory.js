const $ = (id) => document.getElementById(id);
let products = [];
let logs = [];

async function api(path, opts = {}) {
  const response = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const data = await response.json();
  if (!response.ok || data.ok === false) throw new Error(data.message || data.error || 'Request failed');
  return data;
}
function showToast(message) {
  const toast = $('toast'); toast.textContent = message; toast.classList.remove('hidden');
  clearTimeout(showToast._timer); showToast._timer = setTimeout(() => toast.classList.add('hidden'), 3200);
}

function badge(p) {
  if (p.inventory <= 0) return '<span class="stock-pill out">EMPTY</span>';
  if (p.needs_refill) return '<span class="stock-pill low">REFILL</span>';
  if (p.is_full) return '<span class="stock-pill ok">FULL</span>';
  return '<span class="stock-pill ok">OK</span>';
}

function renderAlert() {
  const refill = products.filter(p => p.needs_refill || p.inventory <= 0);
  const full = products.filter(p => p.is_full);
  const b = $('alertBanner');
  if (!refill.length && !full.length) { b.className = 'banner ok'; b.textContent = 'All columns are stocked and none are over capacity.'; return; }
  const parts = [];
  if (refill.length) parts.push(`<strong>Needs refill:</strong> ${refill.map(p => `${p.product_name} (${p.inventory}/${p.max_capacity})`).join(', ')}`);
  if (full.length) parts.push(`<strong>Full:</strong> ${full.map(p => p.product_name).join(', ')}`);
  b.className = 'banner ' + (refill.length ? 'warn' : 'ok');
  b.innerHTML = parts.join(' &nbsp;&middot;&nbsp; ');
}

function renderColumns() {
  $('columnGrid').innerHTML = products.map(p => {
    const pct = Math.round(Math.min(100, (p.inventory / (p.max_capacity || 10)) * 100));
    const barClass = p.inventory <= 0 ? 'empty' : (p.needs_refill ? 'low' : 'ok');
    return `<article class="column-card">
      <div class="column-head"><div><div class="tag">Servo ${p.servo_id} &middot; slot ${p.slot_id}</div><h3>${p.product_name}</h3></div>${badge(p)}</div>
      <div class="capacity-bar"><span class="capacity-fill ${barClass}" style="width:${pct}%"></span></div>
      <div class="capacity-label">${p.inventory} / ${p.max_capacity} loaded &middot; refill threshold ${p.low_stock_threshold}</div>
      <div class="form-grid">
        <label><span>Set count</span><input type="number" min="0" max="${p.max_capacity}" value="${p.inventory}" id="set_${p.product_id}" /></label>
        <label><span>Refill +</span><div class="inline-controls"><input class="small-input" type="number" min="1" value="1" id="refill_${p.product_id}" /><button data-refill="${p.product_id}">Add</button></div></label>
      </div>
    </article>`;
  }).join('');
  [...document.querySelectorAll('[data-refill]')].forEach(btn => btn.addEventListener('click', () => refill(btn.dataset.refill)));
}

function renderLog() {
  const cols = ['Time', 'Action', 'Product', 'Delta', 'After', 'Actor', 'Notes'];
  $('logTable').innerHTML = '<tr>' + cols.map(c => `<th>${c}</th>`).join('') + '</tr>' + (logs.length ? logs.map(l => `<tr><td>${l.time || ''}</td><td>${l.action || ''}</td><td>${l.product_name || ''}</td><td>${l.quantity_delta || ''}</td><td>${l.inventory_after || ''}</td><td>${l.actor || ''}</td><td>${l.notes || ''}</td></tr>`).join('') : `<tr><td colspan="7" class="hint">No inventory activity yet.</td></tr>`);
}

async function load() {
  const d = await api('/api/dashboard');
  products = d.products || [];
  logs = d.recent_inventory_logs || [];
  renderAlert(); renderColumns(); renderLog();
}

async function refill(productId) {
  const qty = Number($(`refill_${productId}`).value || 0);
  if (qty <= 0) return showToast('Refill quantity must be greater than 0.');
  try { await api(`/api/products/${productId}/refill`, { method: 'POST', body: JSON.stringify({ quantity: qty }) }); showToast('Column refilled.'); await load(); }
  catch (e) { showToast(e.message); }
}

async function initializeAll() {
  const items = products.map(p => ({ product_id: p.product_id, count: Number($(`set_${p.product_id}`).value || 0) }));
  const btn = $('initBtn'); const label = btn.textContent; btn.disabled = true; btn.textContent = 'Saving...';
  try { await api('/api/inventory/initialize', { method: 'POST', body: JSON.stringify({ items }) }); showToast('Column counts saved.'); await load(); }
  catch (e) { showToast(e.message); }
  finally { btn.disabled = false; btn.textContent = label; }
}

$('refreshBtn').addEventListener('click', () => load().catch(e => showToast(e.message)));
$('initBtn').addEventListener('click', initializeAll);
load().catch(e => showToast(e.message));
