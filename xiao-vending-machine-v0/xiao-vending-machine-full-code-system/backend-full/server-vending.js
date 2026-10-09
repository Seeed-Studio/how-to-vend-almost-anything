const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.VENDING_PORT || process.env.PORT || 3001;
const WRITER_API_KEY = process.env.WRITER_API_KEY || "WIO_WRITER_SECRET";

const DATA_DIR = path.join(__dirname, "data-vending");
const CARDS_CSV = path.join(DATA_DIR, "cards.csv");
const ORDERS_CSV = path.join(DATA_DIR, "orders.csv");
const INVENTORY_CSV = path.join(DATA_DIR, "inventory.csv");
const LOG_CSV = path.join(DATA_DIR, "transactions.csv");

const ORDER_HEADERS = [
  "order_number", "card_uid", "user_name",
  "q1", "q2", "q3", "q4",
  "c1", "c2", "c3", "c4",
  "status"
];

const writeJobs = [];

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
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map(h => escapeCsv(row[h])).join(","));
  }
  fs.writeFileSync(filePath, lines.join("\n") + "\n", "utf8");
}

function appendCsv(filePath, row, headers) {
  ensureFile(filePath, headers.join(","));
  fs.appendFileSync(filePath, headers.map(h => escapeCsv(row[h])).join(",") + "\n", "utf8");
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeUid(uid) {
  return String(uid || "").trim().toUpperCase().replace(/\s+/g, " ");
}

function normalizeName(name) {
  return String(name || "").trim();
}

function isNullField(value) {
  const text = String(value || "").trim().toLowerCase();
  return text === "" || text === "null" || text === "none";
}

function toInt(value) {
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? 0 : n;
}

function toMoney(value) {
  const n = parseFloat(value);
  return Number.isNaN(n) ? 0 : n;
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
    if (toInt(product.stock) < qty[i]) return false;
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
  return cards.find(card => normalizeUid(card.card_uid) === normalizeUid(uid));
}

function verifyCardIdentity(cards, cardUid, userName) {
  const card = findCard(cards, cardUid);
  if (!card) return { ok: false, error: "UNAUTHORISED" };
  if (normalizeName(card.user_name) !== normalizeName(userName)) {
    return { ok: false, error: "UNAUTHORISED" };
  }
  return { ok: true, card };
}

function findOrderByNumber(orders, orderNumber) {
  const normalized = String(orderNumber || "").trim();
  if (!normalized) return null;
  return orders.find(order => String(order.order_number || "").trim() === normalized);
}

function orderRequestedQty(order) {
  return [toInt(order.q1), toInt(order.q2), toInt(order.q3), toInt(order.q4)];
}

function orderCollectedQty(order) {
  return [toInt(order.c1), toInt(order.c2), toInt(order.c3), toInt(order.c4)];
}

function remainingQty(order) {
  const requested = orderRequestedQty(order);
  const collected = orderCollectedQty(order);
  return requested.map((q, i) => Math.max(0, q - collected[i]));
}

function addCollected(order, dispensed) {
  order.c1 = String(toInt(order.c1) + dispensed[0]);
  order.c2 = String(toInt(order.c2) + dispensed[1]);
  order.c3 = String(toInt(order.c3) + dispensed[2]);
  order.c4 = String(toInt(order.c4) + dispensed[3]);
}

function isOrderFullyCollected(order) {
  return remainingQty(order).every(q => q === 0);
}

function computeDispensePlan(remaining, inventory) {
  const plan = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) {
    const product = inventory.find(item => toInt(item.product_id) === i + 1);
    const stock = product ? toInt(product.stock) : 0;
    plan[i] = Math.min(remaining[i], stock);
  }
  return plan;
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

function migrateOrdersCsv() {
  const rows = readCsv(ORDERS_CSV);
  let changed = false;
  for (const row of rows) {
    for (const col of ["c1", "c2", "c3", "c4"]) {
      if (row[col] === undefined || row[col] === "") {
        row[col] = "0";
        changed = true;
      }
    }
    const status = String(row.status || "").toUpperCase();
    if (status === "USED") {
      row.status = "collected";
      changed = true;
    } else if (status === "READY") {
      row.status = "ready";
      changed = true;
    }
  }
  if (changed || rows.length > 0) {
    writeCsv(ORDERS_CSV, rows, ORDER_HEADERS);
  }
}

function writerAuth(req, res, next) {
  const key = req.headers["x-api-key"] || "";
  if (key !== WRITER_API_KEY) {
    return res.status(401).json({ ok: false, error: "unauthorised" });
  }
  next();
}

function nextJobId() {
  return "job-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
}

// ---------------- INIT DATA FILES ----------------
ensureFile(CARDS_CSV, "card_uid,user_name,mode,balance");
ensureFile(ORDERS_CSV, ORDER_HEADERS.join(","));
ensureFile(INVENTORY_CSV, "product_id,name,servo_id,stock,price");
ensureFile(LOG_CSV, "timestamp,type,card_uid,order_number,quantities,result,notes");
migrateOrdersCsv();

// ---------------- ROUTES ----------------
app.get("/", (req, res) => {
  res.type("text").send("Wio card-flow backend is running (vending server)");
});

app.get("/health", (req, res) => {
  res.json({ ok: true, time: nowIso() });
});

// Wio sends: hardware_uid, card_uid, user_name, order_number, collection_status, balance
app.post("/machine/card-check", (req, res) => {
  const hardwareUid = normalizeUid(req.body.hardware_uid);
  const cardUid = normalizeUid(req.body.card_uid);
  const userName = normalizeName(req.body.user_name);
  let orderNumber = String(req.body.order_number || "").trim();
  const collectionStatus = String(req.body.collection_status || "").trim().toLowerCase();
  const balance = toMoney(req.body.balance);

  if (!cardUid || !userName) {
    logTransaction("card-check", cardUid, orderNumber, [], "ERROR", "missing identity");
    return res.type("text").send("ERROR|UNAUTHORISED");
  }

  const cards = readCsv(CARDS_CSV);
  const identity = verifyCardIdentity(cards, cardUid, userName);
  if (!identity.ok) {
    logTransaction("card-check", cardUid, orderNumber, [], "ERROR", "identity mismatch");
    return res.type("text").send("ERROR|UNAUTHORISED");
  }

  if (isNullField(orderNumber)) {
    const bal = balance.toFixed(2);
    logTransaction("card-check", cardUid, "", [], "DIRECT", `balance ${bal} hw=${hardwareUid}`);
    return res.type("text").send(`DIRECT|${bal}`);
  }

  if (collectionStatus === "collected") {
    logTransaction("card-check", cardUid, orderNumber, [], "ERROR", "already collected on card");
    return res.type("text").send("ERROR|ALREADY_COLLECTED");
  }

  const orders = readCsv(ORDERS_CSV);
  const inventory = readCsv(INVENTORY_CSV);
  const order = findOrderByNumber(orders, orderNumber);

  if (!order) {
    logTransaction("card-check", cardUid, orderNumber, [], "ERROR", "order not found");
    return res.type("text").send("ERROR|ORDER_NOT_FOUND");
  }

  if (normalizeUid(order.card_uid) !== cardUid || normalizeName(order.user_name) !== userName) {
    logTransaction("card-check", cardUid, orderNumber, [], "ERROR", "order identity mismatch");
    return res.type("text").send("ERROR|UNAUTHORISED");
  }

  const csvStatus = String(order.status || "").toLowerCase();
  if (csvStatus === "collected") {
    logTransaction("card-check", cardUid, orderNumber, [], "ERROR", "already collected in csv");
    return res.type("text").send("ERROR|ALREADY_COLLECTED");
  }

  if (collectionStatus !== "ready" && collectionStatus !== "partial" && collectionStatus !== "") {
    logTransaction("card-check", cardUid, orderNumber, [], "ERROR", `bad card status ${collectionStatus}`);
    return res.type("text").send("ERROR|BAD_CARD_STATUS");
  }

  const remaining = remainingQty(order);
  if (remaining.every(q => q === 0)) {
    logTransaction("card-check", cardUid, orderNumber, [], "ERROR", "nothing left to collect");
    return res.type("text").send("ERROR|ALREADY_COLLECTED");
  }

  const plan = computeDispensePlan(remaining, inventory);
  if (plan.every(q => q === 0)) {
    logTransaction("card-check", cardUid, orderNumber, plan, "ERROR", "out of stock");
    return res.type("text").send("ERROR|OUT_OF_STOCK");
  }

  const isFull = plan.every((q, i) => q === remaining[i]);
  const prefix = isFull ? "PREPAID" : "PREPAID_PARTIAL";
  logTransaction("card-check", cardUid, orderNumber, plan, prefix, isFull ? "full plan" : "partial plan");
  return res.type("text").send(`${prefix}|${orderNumber}|${quantityString(plan)}`);
});

app.post("/machine/redeem-order", (req, res) => {
  const cardUid = normalizeUid(req.body.card_uid);
  const userName = normalizeName(req.body.user_name);
  const orderNumber = String(req.body.order_number || "").trim();
  const dispensed = [
    toInt(req.body.q1),
    toInt(req.body.q2),
    toInt(req.body.q3),
    toInt(req.body.q4)
  ];

  if (!cardUid || !userName || !orderNumber) {
    logTransaction("redeem-order", cardUid, orderNumber, dispensed, "DENIED", "missing input");
    return res.type("text").send("DENIED|MISSING_INPUT");
  }

  const cards = readCsv(CARDS_CSV);
  const identity = verifyCardIdentity(cards, cardUid, userName);
  if (!identity.ok) {
    logTransaction("redeem-order", cardUid, orderNumber, dispensed, "DENIED", "identity mismatch");
    return res.type("text").send("DENIED|UNAUTHORISED");
  }

  const orders = readCsv(ORDERS_CSV);
  const inventory = readCsv(INVENTORY_CSV);
  const order = findOrderByNumber(orders, orderNumber);

  if (!order) {
    logTransaction("redeem-order", cardUid, orderNumber, dispensed, "DENIED", "order not found");
    return res.type("text").send("DENIED|ORDER_NOT_FOUND");
  }

  if (normalizeUid(order.card_uid) !== cardUid || normalizeName(order.user_name) !== userName) {
    logTransaction("redeem-order", cardUid, orderNumber, dispensed, "DENIED", "order identity mismatch");
    return res.type("text").send("DENIED|UNAUTHORISED");
  }

  const csvStatus = String(order.status || "").toLowerCase();
  if (csvStatus === "collected") {
    logTransaction("redeem-order", cardUid, orderNumber, dispensed, "DENIED", "already collected");
    return res.type("text").send("DENIED|ALREADY_COLLECTED");
  }

  const remaining = remainingQty(order);
  for (let i = 0; i < 4; i++) {
    if (dispensed[i] < 0 || dispensed[i] > remaining[i]) {
      logTransaction("redeem-order", cardUid, orderNumber, dispensed, "DENIED", "bad quantity");
      return res.type("text").send("DENIED|BAD_QUANTITY");
    }
  }

  if (!hasEnoughStock(dispensed, inventory)) {
    logTransaction("redeem-order", cardUid, orderNumber, dispensed, "DENIED", "out of stock");
    return res.type("text").send("DENIED|OUT_OF_STOCK");
  }

  deductStock(dispensed, inventory);
  addCollected(order, dispensed);

  const cardStatus = isOrderFullyCollected(order) ? "collected" : "partial";
  order.status = cardStatus;

  writeCsv(ORDERS_CSV, orders, ORDER_HEADERS);
  writeCsv(INVENTORY_CSV, inventory, ["product_id", "name", "servo_id", "stock", "price"]);

  logTransaction("redeem-order", cardUid, orderNumber, dispensed, "APPROVED", cardStatus);
  return res.type("text").send(`APPROVED|${cardStatus}|${quantityString(dispensed)}`);
});

app.post("/machine/direct-purchase", (req, res) => {
  const cardUid = normalizeUid(req.body.card_uid);
  const userName = normalizeName(req.body.user_name);
  const balance = toMoney(req.body.balance);
  const requestedQty = [
    toInt(req.body.q1),
    toInt(req.body.q2),
    toInt(req.body.q3),
    toInt(req.body.q4)
  ];

  if (!cardUid || !userName) {
    logTransaction("direct-purchase", cardUid, "", requestedQty, "DENIED", "missing identity");
    return res.type("text").send("DENIED|UNAUTHORISED");
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
  const identity = verifyCardIdentity(cards, cardUid, userName);
  if (!identity.ok) {
    logTransaction("direct-purchase", cardUid, "", requestedQty, "DENIED", "identity mismatch");
    return res.type("text").send("DENIED|UNAUTHORISED");
  }

  const inventory = readCsv(INVENTORY_CSV);
  if (!hasEnoughStock(requestedQty, inventory)) {
    logTransaction("direct-purchase", cardUid, "", requestedQty, "DENIED", "out of stock");
    return res.type("text").send("DENIED|OUT_OF_STOCK");
  }

  const cost = totalCostFromQuantities(requestedQty, inventory);
  if (balance < cost) {
    logTransaction("direct-purchase", cardUid, "", requestedQty, "DENIED", `insufficient balance cost=${cost}`);
    return res.type("text").send("DENIED|INSUFFICIENT_BALANCE");
  }

  const remaining = balance - cost;
  deductStock(requestedQty, inventory);
  writeCsv(INVENTORY_CSV, inventory, ["product_id", "name", "servo_id", "stock", "price"]);

  logTransaction("direct-purchase", cardUid, "", requestedQty, "APPROVED", `remaining ${remaining.toFixed(2)}`);
  return res.type("text").send(`APPROVED|${remaining.toFixed(2)}|${quantityString(requestedQty)}`);
});

// ---------------- RFID WRITER API ----------------
app.post("/api/rfid-writer/jobs", writerAuth, (req, res) => {
  const jobType = String(req.body.job_type || "full_write").trim();
  const cardUid = normalizeUid(req.body.card_uid);
  const userName = normalizeName(req.body.user_name);
  let orderNumber = req.body.order_number;
  let collectionStatus = req.body.collection_status;
  const balance = toMoney(req.body.balance);

  if (!cardUid || !userName) {
    return res.status(400).json({ ok: false, error: "card_uid and user_name required" });
  }

  if (jobType === "full_write") {
    if (isNullField(orderNumber)) {
      orderNumber = null;
      collectionStatus = null;
    } else {
      orderNumber = String(orderNumber).trim();
      collectionStatus = "ready";
    }
  } else if (jobType === "mark_collected") {
    collectionStatus = "collected";
  } else if (jobType === "mark_partial") {
    collectionStatus = "partial";
  } else {
    return res.status(400).json({ ok: false, error: "invalid job_type" });
  }

  const job = {
    job_id: nextJobId(),
    job_type: jobType,
    card_uid: cardUid,
    user_name: userName,
    order_number: orderNumber,
    collection_status: collectionStatus,
    balance: balance.toFixed(2),
    created_at: nowIso()
  };

  writeJobs.push(job);
  res.json({ ok: true, job });
});

app.get("/api/rfid-writer/next-job", writerAuth, (req, res) => {
  const job = writeJobs.shift();
  if (!job) {
    return res.json({ has_job: false });
  }
  res.json({
    has_job: true,
    job_id: job.job_id,
    job_type: job.job_type,
    card_uid: job.card_uid,
    user_name: job.user_name,
    order_number: job.order_number,
    collection_status: job.collection_status,
    balance: job.balance
  });
});

app.post("/api/rfid-writer/job-result", writerAuth, (req, res) => {
  logTransaction(
    "rfid-write",
    req.body.rfid_card_uid || "",
    req.body.job_id || "",
    [],
    req.body.success ? "OK" : "FAIL",
    req.body.message || ""
  );
  res.json({ ok: true });
});

app.post("/api/rfid-writer/status", writerAuth, (req, res) => {
  res.json({ ok: true });
});

app.get("/admin/data", (req, res) => {
  res.json({
    cards: readCsv(CARDS_CSV),
    orders: readCsv(ORDERS_CSV),
    inventory: readCsv(INVENTORY_CSV),
    transactions: readCsv(LOG_CSV),
    pending_writer_jobs: writeJobs.length
  });
});

app.listen(PORT, () => {
  console.log(`Wio card-flow backend running on http://localhost:${PORT}`);
});
