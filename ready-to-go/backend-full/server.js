const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, "data");
const CARDS_CSV = path.join(DATA_DIR, "cards.csv");
const ORDERS_CSV = path.join(DATA_DIR, "orders.csv");
const INVENTORY_CSV = path.join(DATA_DIR, "inventory.csv");
const LOG_CSV = path.join(DATA_DIR, "transactions.csv");

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// ---------------- CSV HELPERS ----------------
function ensureFile(filePath, header) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, header + "\n", "utf8");
  }
}

function escapeCsv(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return '"' + text.replace(/"/g, '""') + '"';
  }
  return text;
}

function parseCsvLine(line) {
  const out = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const c = line[i];

    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === "," && !inQuotes) {
      out.push(current);
      current = "";
    } else {
      current += c;
    }
  }

  out.push(current);
  return out;
}

function readCsv(filePath) {
  if (!fs.existsSync(filePath)) return [];

  const text = fs.readFileSync(filePath, "utf8").replace(/\r/g, "");
  const lines = text.split("\n").filter(line => line.trim().length > 0);

  if (lines.length === 0) return [];

  const headers = parseCsvLine(lines[0]).map(h => h.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row = {};

    headers.forEach((h, idx) => {
      row[h] = values[idx] !== undefined ? values[idx] : "";
    });

    rows.push(row);
  }

  return rows;
}

function writeCsv(filePath, rows, headers) {
  const lines = [];
  lines.push(headers.join(","));

  for (const row of rows) {
    lines.push(headers.map(h => escapeCsv(row[h])).join(","));
  }

  fs.writeFileSync(filePath, lines.join("\n") + "\n", "utf8");
}

function appendCsv(filePath, row, headers) {
  ensureFile(filePath, headers.join(","));

  const line = headers.map(h => escapeCsv(row[h])).join(",");
  fs.appendFileSync(filePath, line + "\n", "utf8");
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeUid(uid) {
  return String(uid || "").trim().toUpperCase().replace(/\s+/g, " ");
}

function toInt(value) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return 0;
  return n;
}

function toMoney(value) {
  const n = parseFloat(value);
  if (Number.isNaN(n)) return 0;
  return n;
}

function quantitiesFromOrder(order) {
  return [
    toInt(order.q1),
    toInt(order.q2),
    toInt(order.q3),
    toInt(order.q4)
  ];
}

function quantityString(qty) {
  return qty.map(n => String(toInt(n))).join(",");
}

function totalCostFromQuantities(qty, inventory) {
  let total = 0;

  for (let i = 0; i < 4; i++) {
    const product = inventory.find(item => toInt(item.product_id) === i + 1);
    if (!product) continue;

    total += qty[i] * toMoney(product.price);
  }

  return total;
}

function hasEnoughStock(qty, inventory) {
  for (let i = 0; i < 4; i++) {
    const product = inventory.find(item => toInt(item.product_id) === i + 1);
    if (!product) return false;

    if (toInt(product.stock) < qty[i]) {
      return false;
    }
  }

  return true;
}

function deductStock(qty, inventory) {
  for (let i = 0; i < 4; i++) {
    const product = inventory.find(item => toInt(item.product_id) === i + 1);
    if (!product) continue;

    product.stock = String(Math.max(0, toInt(product.stock) - qty[i]));
  }
}

function findCard(cards, uid) {
  const normalized = normalizeUid(uid);
  return cards.find(card => normalizeUid(card.card_uid) === normalized);
}

function findReadyOrderForCard(orders, uid) {
  const normalized = normalizeUid(uid);

  return orders.find(order =>
    normalizeUid(order.card_uid) === normalized &&
    String(order.status || "").toUpperCase() === "READY"
  );
}

function logTransaction(type, cardUid, orderNumber, quantities, result, notes) {
  appendCsv(LOG_CSV, {
    timestamp: nowIso(),
    type,
    card_uid: normalizeUid(cardUid),
    order_number: orderNumber || "",
    quantities: Array.isArray(quantities) ? quantityString(quantities) : "",
    result,
    notes: notes || ""
  }, ["timestamp", "type", "card_uid", "order_number", "quantities", "result", "notes"]);
}

// ---------------- INIT DATA FILES ----------------
ensureFile(CARDS_CSV, "card_uid,user_name,mode,balance");
ensureFile(ORDERS_CSV, "order_number,card_uid,user_name,q1,q2,q3,q4,status");
ensureFile(INVENTORY_CSV, "product_id,name,servo_id,stock,price");
ensureFile(LOG_CSV, "timestamp,type,card_uid,order_number,quantities,result,notes");

// ---------------- ROUTES ----------------
app.get("/", (req, res) => {
  res.type("text").send("Wio CSV backend is running");
});

app.get("/health", (req, res) => {
  res.json({ ok: true, time: nowIso() });
});

// Wio sends: card_uid=11%204A%2047%20A0
//
// Response examples:
// PREPAID|ORD-001|1,0,0,0
// DIRECT|20.00
// ERROR|UNKNOWN_CARD
app.post("/machine/card-check", (req, res) => {
  const cardUid = normalizeUid(req.body.card_uid);

  if (!cardUid) {
    logTransaction("card-check", cardUid, "", [], "ERROR", "missing card_uid");
    return res.type("text").send("ERROR|MISSING_CARD_UID");
  }

  const cards = readCsv(CARDS_CSV);
  const orders = readCsv(ORDERS_CSV);

  const card = findCard(cards, cardUid);

  if (!card) {
    logTransaction("card-check", cardUid, "", [], "ERROR", "unknown card");
    return res.type("text").send("ERROR|UNKNOWN_CARD");
  }

  const mode = String(card.mode || "").toUpperCase();

  if (mode === "PREPAID") {
    const order = findReadyOrderForCard(orders, cardUid);

    if (!order) {
      logTransaction("card-check", cardUid, "", [], "ERROR", "no ready prepaid order");
      return res.type("text").send("ERROR|NO_READY_ORDER");
    }

    const qty = quantitiesFromOrder(order);
    logTransaction("card-check", cardUid, order.order_number, qty, "PREPAID", "ready order found");
    return res.type("text").send(`PREPAID|${order.order_number}|${quantityString(qty)}`);
  }

  if (mode === "DIRECT") {
    const balance = toMoney(card.balance).toFixed(2);
    logTransaction("card-check", cardUid, "", [], "DIRECT", `balance ${balance}`);
    return res.type("text").send(`DIRECT|${balance}`);
  }

  logTransaction("card-check", cardUid, "", [], "ERROR", `bad mode ${mode}`);
  return res.type("text").send("ERROR|BAD_CARD_MODE");
});

// Wio sends: card_uid=...&order_number=ORD-001
//
// Response examples:
// APPROVED|1,0,0,0
// DENIED|ALREADY_USED
// DENIED|OUT_OF_STOCK
app.post("/machine/redeem-order", (req, res) => {
  const cardUid = normalizeUid(req.body.card_uid);
  const orderNumber = String(req.body.order_number || "").trim();

  if (!cardUid || !orderNumber) {
    logTransaction("redeem-order", cardUid, orderNumber, [], "DENIED", "missing input");
    return res.type("text").send("DENIED|MISSING_INPUT");
  }

  const orders = readCsv(ORDERS_CSV);
  const inventory = readCsv(INVENTORY_CSV);

  const order = orders.find(row =>
    String(row.order_number || "").trim() === orderNumber &&
    normalizeUid(row.card_uid) === cardUid
  );

  if (!order) {
    logTransaction("redeem-order", cardUid, orderNumber, [], "DENIED", "order not found");
    return res.type("text").send("DENIED|ORDER_NOT_FOUND");
  }

  const status = String(order.status || "").toUpperCase();

  if (status === "USED") {
    logTransaction("redeem-order", cardUid, orderNumber, [], "DENIED", "already used");
    return res.type("text").send("DENIED|ALREADY_USED");
  }

  if (status !== "READY") {
    logTransaction("redeem-order", cardUid, orderNumber, [], "DENIED", `bad status ${status}`);
    return res.type("text").send("DENIED|BAD_ORDER_STATUS");
  }

  const qty = quantitiesFromOrder(order);

  if (!hasEnoughStock(qty, inventory)) {
    logTransaction("redeem-order", cardUid, orderNumber, qty, "DENIED", "out of stock");
    return res.type("text").send("DENIED|OUT_OF_STOCK");
  }

  deductStock(qty, inventory);
  order.status = "USED";

  writeCsv(ORDERS_CSV, orders, ["order_number", "card_uid", "user_name", "q1", "q2", "q3", "q4", "status"]);
  writeCsv(INVENTORY_CSV, inventory, ["product_id", "name", "servo_id", "stock", "price"]);

  logTransaction("redeem-order", cardUid, orderNumber, qty, "APPROVED", "order redeemed");
  return res.type("text").send(`APPROVED|${quantityString(qty)}`);
});

// Wio sends: card_uid=...&q1=1&q2=0&q3=0&q4=0
//
// Response examples:
// APPROVED|15.00|1,0,0,0
// DENIED|INSUFFICIENT_BALANCE
// DENIED|OUT_OF_STOCK
app.post("/machine/direct-purchase", (req, res) => {
  const cardUid = normalizeUid(req.body.card_uid);
  const requestedQty = [
    toInt(req.body.q1),
    toInt(req.body.q2),
    toInt(req.body.q3),
    toInt(req.body.q4)
  ];

  if (!cardUid) {
    logTransaction("direct-purchase", cardUid, "", requestedQty, "DENIED", "missing card_uid");
    return res.type("text").send("DENIED|MISSING_CARD_UID");
  }

  if (requestedQty.some(q => q < 0 || q > 10)) {
    logTransaction("direct-purchase", cardUid, "", requestedQty, "DENIED", "bad quantity");
    return res.type("text").send("DENIED|BAD_QUANTITY");
  }

  if (requestedQty.every(q => q === 0)) {
    logTransaction("direct-purchase", cardUid, "", requestedQty, "DENIED", "empty cart");
    return res.type("text").send("DENIED|EMPTY_CART");
  }

  const cards = readCsv(CARDS_CSV);
  const inventory = readCsv(INVENTORY_CSV);

  const card = findCard(cards, cardUid);

  if (!card) {
    logTransaction("direct-purchase", cardUid, "", requestedQty, "DENIED", "unknown card");
    return res.type("text").send("DENIED|UNKNOWN_CARD");
  }

  if (String(card.mode || "").toUpperCase() !== "DIRECT") {
    logTransaction("direct-purchase", cardUid, "", requestedQty, "DENIED", "not direct card");
    return res.type("text").send("DENIED|NOT_DIRECT_CARD");
  }

  if (!hasEnoughStock(requestedQty, inventory)) {
    logTransaction("direct-purchase", cardUid, "", requestedQty, "DENIED", "out of stock");
    return res.type("text").send("DENIED|OUT_OF_STOCK");
  }

  const cost = totalCostFromQuantities(requestedQty, inventory);
  const balance = toMoney(card.balance);

  if (balance < cost) {
    logTransaction("direct-purchase", cardUid, "", requestedQty, "DENIED", `insufficient balance cost=${cost}`);
    return res.type("text").send("DENIED|INSUFFICIENT_BALANCE");
  }

  const remaining = balance - cost;
  card.balance = remaining.toFixed(2);

  deductStock(requestedQty, inventory);

  writeCsv(CARDS_CSV, cards, ["card_uid", "user_name", "mode", "balance"]);
  writeCsv(INVENTORY_CSV, inventory, ["product_id", "name", "servo_id", "stock", "price"]);

  logTransaction("direct-purchase", cardUid, "", requestedQty, "APPROVED", `remaining ${remaining.toFixed(2)}`);
  return res.type("text").send(`APPROVED|${remaining.toFixed(2)}|${quantityString(requestedQty)}`);
});

// Optional admin view for quick checking in browser
app.get("/admin/data", (req, res) => {
  res.json({
    cards: readCsv(CARDS_CSV),
    orders: readCsv(ORDERS_CSV),
    inventory: readCsv(INVENTORY_CSV),
    transactions: readCsv(LOG_CSV)
  });
});

app.listen(PORT, () => {
  console.log(`Wio CSV backend running on http://localhost:${PORT}`);
});
