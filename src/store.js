// college-project ke liye simple JSON-file "database" — data/db.json me sab kuch persist hota hai.
// Bade scale ke liye ise Firestore/MongoDB me badalna ho to sirf isी file ke functions rewrite karo,
// baaki koi route/controller touch nahi karna padega (README.md me example diya hai).

const fs = require("fs");
const path = require("path");
const C = require("./config");

const DB_PATH = path.join(__dirname, "..", "data", "db.json");

const DEFAULT_RATES = {
  bwSingle: 1,
  bwDouble: 1.6,
  colorSingle: 5,
  colorDouble: 9,
  a3Extra: 2,
  photo: 10,
  staple: 5,
  spiral: 30,
  minOrder: 5,
};

function defaultDb() {
  return {
    ownerEmail: C.OWNER_EMAIL,
    config: {
      rates: { ...DEFAULT_RATES },
      extras: [],
      shop: {
        discountOn: false,
        discountPct: 15,
        discountText: "Limited time offer",
        upi: "shivanisingh5332788-1@okicici",
        advancePct: 50,
        verificationRequired: true,
        qrUrl: null,
      },
    },
    orders: {},
    files: {},
    otpPool: { codes: [], addedTotal: 0, usedTotal: 0 },
  };
}

function ensureDb() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(defaultDb(), null, 2));
  }
}

function read() {
  ensureDb();
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

function write(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

module.exports = {
  // ---------- config (rates / extras / shop) ----------
  getConfig() {
    return read().config;
  },
  saveConfig(patch = {}) {
    const db = read();
    if (patch.rates) db.config.rates = { ...db.config.rates, ...patch.rates };
    if (patch.extras) db.config.extras = patch.extras;
    if (patch.shop) db.config.shop = { ...db.config.shop, ...patch.shop };
    write(db);
    return db.config;
  },
  setQrUrl(qrUrl) {
    const db = read();
    db.config.shop.qrUrl = qrUrl;
    write(db);
    return db.config.shop;
  },

  // ---------- owner email (locked in config.js) ----------
  getOwnerEmail() {
    return read().ownerEmail;
  },
  setOwnerEmailOnce() {
    const err = new Error("Owner email .env/config.js me fix hai, yahan se badla nahi ja sakta.");
    err.status = 400;
    throw err;
  },

  // ---------- orders ----------
  createOrder(order) {
    const db = read();
    db.orders[order.id] = order;
    write(db);
    return order;
  },
  getOrder(id) {
    return read().orders[id] || null;
  },
  getAllOrders() {
    const db = read();
    return Object.values(db.orders).sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
  },
  updateOrder(id, patch) {
    const db = read();
    if (!db.orders[id]) return null;
    db.orders[id] = { ...db.orders[id], ...patch };
    write(db);
    return db.orders[id];
  },
  // UTR kabhi bhi repeat nahi hona chahiye — isi se payment screenshot dubara
  // submit karke fraud order confirm karwana rokte hain. excludeOrderId optional hai
  // (same order ko dubara check karte waqt khud se match na ho isliye).
  findOrderByUtr(utr, excludeOrderId) {
    const db = read();
    const target = String(utr || "").trim().toLowerCase();
    if (!target) return null;
    return (
      Object.values(db.orders).find(
        (o) => o.id !== excludeOrderId && String(o.payment?.utr || "").trim().toLowerCase() === target
      ) || null
    );
  },

  // ---------- uploaded files metadata ----------
  saveFile(meta) {
    const db = read();
    db.files[meta.id] = meta;
    write(db);
    return meta;
  },
  getFile(id) {
    return read().files[id] || null;
  },
  getAllFiles() {
    const db = read();
    return Object.values(db.files).sort(
      (a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt)
    );
  },
  linkFilesToOrder(fileIds, orderId) {
    const db = read();
    fileIds.forEach((id) => {
      if (db.files[id]) db.files[id].order = { orderId };
    });
    write(db);
  },
  // Owner ne file khol li (preview dekh li) — ab wo "Recent" se "Seen" me chali jaayegi.
  markFileSeen(id) {
    const db = read();
    if (!db.files[id]) return null;
    db.files[id].seen = true;
    write(db);
    return db.files[id];
  },

  // ---------- OTP codes pool (OTP_SOURCE=pool ke liye) ----------
  getOtpPoolStatus() {
    const p = read().otpPool;
    return { remaining: p.codes.length, addedTotal: p.addedTotal, usedTotal: p.usedTotal };
  },
  addOtpPoolCodes(codes) {
    const db = read();
    const existing = new Set(db.otpPool.codes);
    let added = 0;
    codes.forEach((c) => {
      if (/^\d{6}$/.test(c) && !existing.has(c)) {
        db.otpPool.codes.push(c);
        existing.add(c);
        added++;
      }
    });
    db.otpPool.addedTotal += added;
    write(db);
    return { added, remaining: db.otpPool.codes.length };
  },
  popOtpPoolCode() {
    const db = read();
    const code = db.otpPool.codes.shift();
    if (code) db.otpPool.usedTotal += 1;
    write(db);
    return code || null;
  },
  clearOtpPool() {
    const db = read();
    db.otpPool.codes = [];
    write(db);
  },
};
