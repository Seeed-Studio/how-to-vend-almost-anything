(function () {
  const zh = () => (document.documentElement.lang || "en").toLowerCase().startsWith("zh");
  const money = (value) => `$${Number(value || 0).toFixed(2)}`;
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
  const now = () => new Date().toISOString().slice(0, 19).replace("T", " ");
  const listeners = new Set();
  const notify = () => listeners.forEach((fn) => {
    try { fn(); } catch (error) { listeners.delete(fn); }
  });

  const products = [
    { product_id: "P001", product_name: "XIAO ESP32-S3 Sense", servo_id: 1, slot_id: "A1", inventory: 6, price: 15.99, low_stock_threshold: 3, max_capacity: 10, active: 1, tag: "Vision + Voice AI", image_path: "assets/products/xiao-esp32-s3-sense.jpg", feature_1: "Wi-Fi + BLE", feature_2: "Camera-ready Sense module", feature_3: "Great for AI sensing demos" },
    { product_id: "P002", product_name: "XIAO ESP32-C3", servo_id: 2, slot_id: "A2", inventory: 5, price: 4.99, low_stock_threshold: 3, max_capacity: 10, active: 1, tag: "Entry Wi-Fi/BLE", image_path: "assets/products/xiao-esp32-c3.jpg", feature_1: "RISC-V MCU", feature_2: "Wi-Fi + BLE 5", feature_3: "Low-cost compact XIAO form factor" },
    { product_id: "P003", product_name: "XIAO ESP32-C5", servo_id: 3, slot_id: "A3", inventory: 5, price: 6.9, low_stock_threshold: 3, max_capacity: 10, active: 1, tag: "Dual-band IoT", image_path: "assets/products/xiao-esp32-c5.jpg", feature_1: "Dual-band Wi-Fi 6", feature_2: "BLE 5 support", feature_3: "802.15.4 for Thread / Zigbee style use" },
    { product_id: "P004", product_name: "XIAO nRF52840 Sense", servo_id: 4, slot_id: "A4", inventory: 4, price: 15.99, low_stock_threshold: 3, max_capacity: 10, active: 1, tag: "BLE + TinyML", image_path: "assets/products/xiao-nrf52840-sense.jpg", feature_1: "Bluetooth LE", feature_2: "Low-power MCU", feature_3: "Useful for wearables and TinyML" }
  ];
  const cards = [
    { id: "card-direct", type: "direct", user_name: "Alex", items: [{ product_id: "P002", qty: 1 }], order_number: "A-1001", card_uid: "04 A1 22 8C", balance: 0, updated_at: now() },
    { id: "card-select", type: "selecting", user_name: "Sam", items: [], order_number: "", card_uid: "04 B2 10 11", balance: 40, updated_at: now() }
  ];
  const orders = [
    { order_number: "A-1001", user_name: "Alex", product_name: "XIAO ESP32-C3", quantity: 1, status: "PENDING_WRITE", card_id: "card-direct" }
  ];
  const jobs = [];
  const logs = [];
  const cart = {};
  let nextCard = 3;
  let nextOrder = 1002;
  let lastWrite = { title: "Last write job", body: "No card queued yet.", steps: [] };

  const ui = {
    phase: "welcome",
    cardId: null,
    cursor: 0,
    qty: [0, 0, 0, 0],
    queue: [],
    step: 1,
    stepDrawn: false,
    message: null,
    timer: null,
    afterMessage: null
  };
  let host = null;
  let observer = null;

  function productById(id) {
    return products.find((item) => item.product_id === id) || null;
  }
  function cardById(id) {
    return cards.find((item) => item.id === id) || null;
  }
  function needsRefill(product) {
    return product.inventory <= product.low_stock_threshold;
  }
  function clearTimer() {
    if (ui.timer) {
      clearTimeout(ui.timer);
      ui.timer = null;
    }
  }
  function logInventory(action, product, delta, notes) {
    logs.unshift({
      time: now(),
      action,
      product_name: product.product_name,
      quantity_delta: delta,
      inventory_after: product.inventory,
      actor: "preview",
      notes
    });
  }
  function metrics() {
    const units = products.reduce((sum, product) => sum + product.inventory, 0);
    const capacity = products.reduce((sum, product) => sum + product.max_capacity, 0);
    const refill = products.filter(needsRefill).length;
    const balance = cards.filter((card) => card.type === "selecting").reduce((sum, card) => sum + Number(card.balance || 0), 0);
    const pending = jobs.filter((job) => job.status === "PENDING" || job.status === "PENDING_WRITE").length;
    return { units, capacity, refill, balance, pending };
  }

  function setQty(id, qty) {
    const product = productById(id);
    let next = Math.round(Number(qty) || 0);
    if (next < 0) next = 0;
    if (product && next > product.max_capacity) next = product.max_capacity;
    if (next === 0) delete cart[id];
    else cart[id] = next;
    notify();
  }
  function createOrder(userName, amountPaid) {
    const name = String(userName || "").trim();
    const lines = products.filter((product) => (cart[product.product_id] || 0) > 0);
    if (!name) return { ok: false, message: zh() ? "请填写顾客名字。" : "Add the customer name." };
    if (!lines.length) return { ok: false, message: zh() ? "请至少选择一件。" : "Choose at least one item." };
    const items = lines.map((product) => ({ product_id: product.product_id, qty: cart[product.product_id] }));
    const total = lines.reduce((sum, product) => sum + product.price * cart[product.product_id], 0);
    const paid = amountPaid === "" || amountPaid == null ? total : Number(amountPaid);
    const orderNumber = `A-${nextOrder++}`;
    const card = {
      id: `card-${nextCard++}`,
      type: "direct",
      user_name: name,
      items,
      order_number: orderNumber,
      card_uid: `04 DE ${String(nextCard).padStart(2, "0")} 01`,
      balance: 0,
      updated_at: now()
    };
    cards.unshift(card);
    orders.unshift({
      order_number: orderNumber,
      user_name: name,
      product_name: lines.map((product) => product.product_name).join(", "),
      quantity: items.reduce((sum, item) => sum + item.qty, 0),
      status: "PENDING_WRITE",
      card_id: card.id
    });
    const payload = JSON.stringify({ type: "direct", user: name, order_number: orderNumber, amount_paid: Number(paid || 0).toFixed(2), items });
    jobs.unshift({ job_type: "ORDER", user_name: name, order_number: orderNumber, status: "PENDING", message: "Queued for the Wio writer" });
    lastWrite = {
      title: "Direct order card queued",
      body: payload,
      steps: [
        "Order created (stock deducted at collection).",
        "Present a blank card on the Wio writer to encode it.",
        "The machine dispenses all these products from this one card.",
        "In this preview the card can be tapped on the vending screen."
      ]
    };
    Object.keys(cart).forEach((key) => delete cart[key]);
    notify();
    return { ok: true, message: zh() ? "直接订单卡已排队。" : "Direct order card queued." };
  }
  function writeBalance(userName, amount, mode) {
    const name = String(userName || "").trim();
    const value = Number(amount);
    if (!name) return { ok: false, message: zh() ? "请填写顾客名字。" : "Add the customer name." };
    if (!Number.isFinite(value) || value < 0) return { ok: false, message: zh() ? "请填写金额。" : "Enter an amount." };
    let card = cards.find((item) => item.type === "selecting" && item.user_name.toLowerCase() === name.toLowerCase());
    if (!card) {
      card = {
        id: `card-${nextCard++}`,
        type: "selecting",
        user_name: name,
        items: [],
        order_number: "",
        card_uid: `04 BA ${String(nextCard).padStart(2, "0")} 02`,
        balance: 0,
        updated_at: now()
      };
      cards.unshift(card);
    }
    card.balance = mode === "set" ? value : Number(card.balance || 0) + value;
    card.updated_at = now();
    const payload = JSON.stringify({ type: "selecting", user: name, balance: Number(card.balance).toFixed(2) });
    jobs.unshift({ job_type: "BALANCE", user_name: name, order_number: "-", status: "PENDING", message: "Queued for the Wio writer" });
    lastWrite = {
      title: "Balance card queued",
      body: payload,
      steps: [
        "Balance is stored by user name.",
        "Present a card on the Wio writer to encode the selecting type and name.",
        "The customer picks products on the machine against this balance.",
        "In this preview the card can be tapped on the vending screen."
      ]
    };
    notify();
    return { ok: true, message: zh() ? "余额卡已排队。" : "Balance card queued." };
  }
  function refill(id, qty) {
    const product = productById(id);
    const amount = Math.round(Number(qty) || 0);
    if (!product || amount <= 0) return { ok: false, message: zh() ? "补货数量要大于 0。" : "Refill quantity must be greater than 0." };
    const before = product.inventory;
    product.inventory = Math.min(product.max_capacity, product.inventory + amount);
    logInventory("refill", product, product.inventory - before, "Refill");
    notify();
    return { ok: true, message: zh() ? "这一列已补货。" : "Column refilled." };
  }
  function saveCounts(counts) {
    products.forEach((product) => {
      if (!(product.product_id in counts)) return;
      let count = Math.round(Number(counts[product.product_id]) || 0);
      if (count < 0) count = 0;
      if (count > product.max_capacity) count = product.max_capacity;
      const delta = count - product.inventory;
      product.inventory = count;
      if (delta) logInventory("initialize", product, delta, "Set count");
    });
    notify();
    return { ok: true, message: zh() ? "库存数量已保存。" : "Column counts saved." };
  }

  window.VENDING_SESSION = {
    snapshot() {
      return {
        lang: zh() ? "zh" : "en",
        products: products.map((product) => ({ ...product, needs_refill: needsRefill(product), is_full: product.inventory >= product.max_capacity })),
        cards: cards.map((card) => ({ ...card, items: card.items.map((item) => ({ ...item })) })),
        orders: orders.map((order) => ({ ...order })),
        jobs: jobs.map((job) => ({ ...job })),
        logs: logs.map((entry) => ({ ...entry })),
        cart: { ...cart },
        metrics: metrics(),
        lastWrite: { ...lastWrite, steps: lastWrite.steps.slice() }
      };
    },
    setQty,
    createOrder,
    writeBalance,
    refill,
    saveCounts,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  };

  function showMessage(message, after) {
    ui.phase = "message";
    ui.message = message;
    ui.afterMessage = after || null;
    renderCustomer();
    if (after) ui.timer = setTimeout(after, message.hold || 1400);
  }
  function goWelcome() {
    clearTimer();
    ui.phase = "welcome";
    ui.cardId = null;
    ui.message = null;
    ui.afterMessage = null;
    ui.queue = [];
    renderCustomer();
  }
  function cartTotal(qty) {
    return products.reduce((sum, product, index) => sum + (qty[index] || 0) * product.price, 0);
  }
  function startQueue(card, units, orderNumber) {
    ui.cardId = card.id;
    ui.queue = units;
    ui.step = 1;
    ui.stepDrawn = false;
    ui.phase = "dispense";
    ui.orderNumber = orderNumber || "";
    beginStep();
  }
  function beginStep() {
    const product = ui.queue[ui.step - 1];
    if (!product || product.inventory <= 0) {
      const order = orders.find((item) => item.order_number === ui.orderNumber);
      if (order) order.status = "DISPENSE_FAILED";
      showMessage({
        title: "REFILL",
        l1: "Column empty",
        l2: product ? product.product_name : "",
        l3: "Ask the operator to refill",
        accent: "red",
        glyph: "cross",
        hint: "seeed studio   -   XIAO Vending",
        hold: 1600
      }, goWelcome);
      return;
    }
    product.inventory -= 1;
    logInventory("dispense", product, -1, ui.orderNumber || "collect");
    ui.stepDrawn = true;
    ui.phase = "dispense";
    renderCustomer();
    notify();
    ui.timer = setTimeout(advanceStep, 750);
  }
  function advanceStep() {
    ui.timer = null;
    if (ui.step >= ui.queue.length) {
      const card = cardById(ui.cardId);
      const order = orders.find((item) => item.order_number === ui.orderNumber);
      if (order) order.status = "DISPENSED";
      showMessage({
        title: "COLLECTED",
        l1: "Thank you",
        l2: card ? card.user_name : "",
        l3: card && card.type === "selecting" ? `Balance ${money(card.balance)}` : "Order complete",
        accent: "green",
        glyph: "check",
        hint: "Take the products from the tray",
        hold: 1700
      }, goWelcome);
      notify();
      return;
    }
    ui.step += 1;
    beginStep();
  }
  function startDirect(card) {
    const units = [];
    for (const item of card.items) {
      const product = productById(item.product_id);
      if (!product || product.inventory < item.qty) {
        showMessage({
          title: "REFILL",
          l1: "Not enough stock",
          l2: product ? product.product_name : "",
          l3: "This order was not dispensed",
          accent: "red",
          glyph: "cross",
          hint: "seeed studio   -   XIAO Vending",
          hold: 1600
        }, goWelcome);
        return;
      }
      for (let i = 0; i < item.qty; i += 1) units.push(product);
    }
    startQueue(card, units, card.order_number);
  }
  function startSelect(card) {
    ui.cardId = card.id;
    ui.cursor = 0;
    ui.qty = [0, 0, 0, 0];
    ui.phase = "select";
    renderCustomer();
  }
  function scan(card) {
    if (ui.phase === "dispense") return;
    clearTimer();
    ui.cardId = card.id;
    showMessage({
      title: "CARD",
      l1: "Reading card",
      l2: card.user_name,
      l3: card.type === "direct" ? "Direct order" : "Selecting balance",
      accent: "info",
      glyph: "card",
      hint: "Hold the card on the reader",
      hold: 700
    }, () => (card.type === "direct" ? startDirect(card) : startSelect(card)));
  }
  function pressKey(key) {
    if (ui.phase === "message") {
      clearTimer();
      if (ui.message && ui.message.returnTo === "select") {
        ui.phase = "select";
        renderCustomer();
      } else goWelcome();
      return;
    }
    if (key === "a") {
      if (ui.phase === "select") goWelcome();
      return;
    }
    if (ui.phase !== "select") return;
    const count = products.length + 2;
    if (key === "down") ui.cursor = (ui.cursor + 1) % count;
    if (key === "up") ui.cursor = (ui.cursor + count - 1) % count;
    if (ui.cursor < products.length) {
      const max = Math.min(9, products[ui.cursor].inventory);
      if (key === "right" && ui.qty[ui.cursor] < max) ui.qty[ui.cursor] += 1;
      if (key === "left" && ui.qty[ui.cursor] > 0) ui.qty[ui.cursor] -= 1;
      if (key === "press" && ui.qty[ui.cursor] < max) ui.qty[ui.cursor] += 1;
      renderCustomer();
      return;
    }
    if (key !== "press") {
      renderCustomer();
      return;
    }
    if (ui.cursor === products.length + 1) {
      ui.qty = [0, 0, 0, 0];
      renderCustomer();
      return;
    }
    const card = cardById(ui.cardId);
    const any = ui.qty.some((qty) => qty > 0);
    const total = cartTotal(ui.qty);
    if (!any) {
      showMessage({ title: "SELECT", l1: "Nothing picked", l2: "Choose an item", accent: "amber", glyph: "warn", hint: "Joy move   L/R qty   Press pick   A cancel", hold: 1100, returnTo: "select" }, () => { ui.phase = "select"; renderCustomer(); });
      return;
    }
    if (!card || total > Number(card.balance) + 0.0001) {
      showMessage({ title: "SELECT", l1: "Not enough", l2: "balance", accent: "red", glyph: "cross", hint: "Joy move   L/R qty   Press pick   A cancel", hold: 1100, returnTo: "select" }, () => { ui.phase = "select"; renderCustomer(); });
      return;
    }
    card.balance = Number(card.balance) - total;
    card.updated_at = now();
    const units = [];
    const names = [];
    ui.qty.forEach((qty, index) => {
      if (!qty) return;
      names.push(products[index].product_name);
      for (let i = 0; i < qty; i += 1) units.push(products[index]);
    });
    const orderNumber = `S-${nextOrder++}`;
    orders.unshift({
      order_number: orderNumber,
      user_name: card.user_name,
      product_name: names.join(", "),
      quantity: units.length,
      status: "CLAIMED",
      card_id: card.id
    });
    startQueue(card, units, orderNumber);
  }

  function glyph(name) {
    const paths = {
      check: '<path d="M8 18 l6 6 l12-14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
      cross: '<path d="M11 11 l14 14 M25 11 l-14 14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
      warn: '<path d="M18 8 l12 20 H6 Z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M18 16 v6 M18 25 v2" stroke="currentColor" stroke-width="2"/>',
      info: '<circle cx="18" cy="18" r="11" fill="none" stroke="currentColor" stroke-width="2"/><path d="M18 12 v2 M18 16 v8" stroke="currentColor" stroke-width="2"/>',
      card: '<rect x="6" y="10" width="16" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><rect x="9" y="14" width="6" height="4" fill="currentColor"/><path d="M26 13 v10 M30 11 v14" stroke="currentColor" stroke-width="2"/>',
      leaf: '<path d="M18 28 V16" stroke="currentColor" stroke-width="3"/><path d="M17 20 C8 16 8 8 16 8 C16 16 18 20 17 20 Z" fill="currentColor"/><path d="M19 16 C28 12 30 6 22 6 C20 12 19 16 19 16 Z" fill="currentColor" opacity=".75"/>'
    };
    return `<svg viewBox="0 0 36 36" aria-hidden="true">${paths[name] || paths.card}</svg>`;
  }
  function statusBar() {
    return `<div class="lcd-status"><i class="lcd-mark"></i><b>seeed</b><span>studio</span><em class="online">online<i></i></em></div>`;
  }
  function hintBar(text) {
    return `<div class="lcd-hint">${esc(text)}</div>`;
  }
  function medallion(name, accent) {
    return `<div class="lcd-medal accent-${accent}">${glyph(name)}</div>`;
  }
  function messageScreen(message) {
    return `${statusBar()}${medallion(message.glyph || "info", message.accent || "green")}
      <div class="lcd-copy">
        <div class="lcd-kicker accent-${message.accent || "green"}">${esc(message.title || "")}</div>
        <div class="lcd-headline">${esc(message.l1 || "")}</div>
        ${message.l2 ? `<div class="lcd-sub">${esc(message.l2)}</div>` : ""}
        ${message.l3 ? `<div class="lcd-sub">${esc(message.l3)}</div>` : ""}
      </div>
      ${hintBar(message.hint || "seeed studio   -   XIAO Vending")}`;
  }
  function welcomeScreen() {
    return `${statusBar()}${medallion("card", "green")}
      <div class="lcd-copy">
        <div class="lcd-kicker accent-green">WELCOME</div>
        <div class="lcd-headline">Scan your card</div>
        <div class="lcd-sub">Collect an order or shop your balance</div>
      </div>
      ${hintBar("Tap a card on the reader")}`;
  }
  function dispenseScreen() {
    const product = ui.queue[ui.step - 1];
    const card = cardById(ui.cardId);
    const total = ui.queue.length || 1;
    const width = Math.max(0, Math.round(((ui.step / total) * 280)));
    return `${statusBar()}
      <div class="lcd-dispense">
        <div class="lcd-kicker accent-green">DISPENSING  -  ITEM ${ui.step} OF ${total}</div>
        <div class="lcd-dispense-title">Column ${product ? product.servo_id : "-"}</div>
        <div class="lcd-dispense-servo">Servo ${product ? product.servo_id : "-"}</div>
        <div class="lcd-sub">Card: ${esc(card ? card.user_name : "")}</div>
        <b class="accent-green">${ui.step}/${total}</b>
        <div class="lcd-progress"><span style="width:${width}px"></span></div>
      </div>
      ${hintBar("Please wait  -  keep the card in place")}`;
  }
  function selectScreen() {
    const card = cardById(ui.cardId);
    const balance = Number(card ? card.balance : 0);
    const cost = cartTotal(ui.qty);
    const left = balance - cost;
    const top = 48;
    const rows = products.map((product, index) => {
      const y = top + index * 29;
      const picked = ui.qty[index] || 0;
      const sellable = product.inventory > 0 && product.active === 1;
      let countClass = picked > 0 ? "accent-green" : (sellable ? "" : "is-muted");
      if (product.inventory <= 0) countClass = "accent-red";
      else if (needsRefill(product)) countClass = "accent-amber";
      const name = product.product_name.length > 13 ? product.product_name.slice(0, 13) : product.product_name;
      const hot = ui.cursor === index ? "is-hot" : "";
      return `<div class="lcd-row ${hot}" style="top:${y}px">
        <b class="${hot ? "accent-green" : "is-muted"}">${product.servo_id}</b>
        <span class="${sellable ? "" : "is-muted"}">${esc(name)}</span>
        <em>${money(product.price)}</em>
        <strong class="${countClass}">${picked}/${product.inventory}</strong>
      </div>`;
    }).join("");
    const by = top + products.length * 29 + 4;
    const buyHot = ui.cursor === products.length;
    const clearHot = ui.cursor === products.length + 1;
    return `<div class="lcd-select-head"><b class="accent-green">SELECT</b><b>PRODUCTS</b><em>seeed studio</em></div>
      <div class="lcd-balance"><span>Bal ${money(balance)}</span><span>Cost ${money(cost)}</span><span class="${left < 0 ? "accent-red" : "accent-green"}">Left ${money(left)}</span></div>
      ${rows}
      <button type="button" class="lcd-buy ${buyHot ? "is-hot" : ""}" style="top:${by}px" data-key="buy">BUY</button>
      <button type="button" class="lcd-clear ${clearHot ? "is-hot" : ""}" style="top:${by}px" data-key="clear">CLEAR</button>
      ${hintBar("Joy move   L/R qty   Press pick   A cancel")}`;
  }
  function screenHtml() {
    if (ui.phase === "select") return selectScreen();
    if (ui.phase === "dispense") return dispenseScreen();
    if (ui.phase === "message" && ui.message) return messageScreen(ui.message);
    return welcomeScreen();
  }
  function renderCustomer() {
    if (!host || !host.classList.contains("is-vending")) return;
    const caption = zh()
      ? "把卡贴到读卡器上。摇杆：上下移动，左右改数量，按下确认，A 取消。屏幕文字与固件一致。"
      : "Tap a card on the reader. Joystick: up and down move, left and right change quantity, press to pick, A cancels.";
    host.innerHTML = `<div class="wio-stage">
      <div class="wio-bezel">
        <div class="wio-slot"><div class="wio-lcd">${screenHtml()}</div></div>
      </div>
      <div class="wio-dock">
        <div class="wio-controls">
          <button type="button" class="wio-key-a" data-key="a">A</button>
          <div class="wio-pad" aria-label="5-way switch">
            <button type="button" data-key="up" aria-label="Up">▲</button>
            <button type="button" data-key="left" aria-label="Left">◀</button>
            <button type="button" data-key="press" aria-label="Press">●</button>
            <button type="button" data-key="right" aria-label="Right">▶</button>
            <button type="button" data-key="down" aria-label="Down">▼</button>
          </div>
        </div>
        <div class="rfid-row">${cards.map((card) => `<button type="button" class="rfid-card" data-card="${esc(card.id)}" ${ui.phase === "dispense" ? "disabled" : ""}>
          <span>${esc(card.user_name)}</span>
          <small>${card.type === "direct" ? "DIRECT ORDER" : `BALANCE ${money(card.balance)}`}</small>
        </button>`).join("")}</div>
      </div>
      <p class="wio-caption">${caption}</p>
    </div>`;
    host.querySelectorAll("[data-card]").forEach((button) => {
      button.addEventListener("click", () => {
        const card = cardById(button.dataset.card);
        if (card) scan(card);
      });
    });
    host.querySelectorAll("[data-key]").forEach((button) => {
      button.addEventListener("click", () => {
        if (button.dataset.key === "buy") {
          ui.cursor = products.length;
          pressKey("press");
          return;
        }
        if (button.dataset.key === "clear") {
          ui.cursor = products.length + 1;
          pressKey("press");
          return;
        }
        pressKey(button.dataset.key);
      });
    });
    const slot = host.querySelector(".wio-slot");
    const lcd = host.querySelector(".wio-lcd");
    const fit = () => {
      if (!slot || !lcd) return;
      lcd.style.transform = `scale(${slot.clientWidth / 320})`;
    };
    fit();
    if (observer) observer.disconnect();
    if (slot && "ResizeObserver" in window) {
      observer = new ResizeObserver(fit);
      observer.observe(slot);
    }
  }

  window.VENDING_DEMO = {
    mount(root, system) {
      host = root;
      clearTimer();
      root.classList.toggle("is-operator", system === "operator");
      root.classList.toggle("is-vending", system === "vending");
      if (system === "operator") {
        if (observer) observer.disconnect();
        root.innerHTML = `<iframe class="ops-frame" title="${zh() ? "控制面板" : "Control Panel"}" src="../assets/demo/operator.html?lang=${zh() ? "zh" : "en"}&v=fit"></iframe>`;
        return;
      }
      renderCustomer();
      if (ui.phase === "dispense" && ui.stepDrawn) ui.timer = setTimeout(advanceStep, 750);
    }
  };
})();
