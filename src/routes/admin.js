const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const C = require("../config");
const store = require("../store");
const requireOwner = require("../middleware/requireOwner");

// ---------------- login lockout (per-IP, in-memory) ----------------
const attempts = new Map();
function checkLock(ip) {
  const rec = attempts.get(ip);
  if (rec?.lockedUntil && Date.now() < rec.lockedUntil) {
    return Math.ceil((rec.lockedUntil - Date.now()) / 60000);
  }
  return 0;
}
function recordFail(ip) {
  const rec = attempts.get(ip) || { count: 0 };
  rec.count += 1;
  if (rec.count >= 5) rec.lockedUntil = Date.now() + 30 * 60 * 1000;
  attempts.set(ip, rec);
}
function recordSuccess(ip) {
  attempts.delete(ip);
}

router.get("/owner-status", (req, res) => {
  res.json({ emailSet: true, email: store.getOwnerEmail() });
});

router.post("/setup-email", (req, res) => {
  try {
    store.setOwnerEmailOnce(req.body.email);
    res.json({ email: store.getOwnerEmail() });
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message });
  }
});

router.post("/login", async (req, res) => {
  const ip = req.ip;
  const lockedMins = checkLock(ip);
  if (lockedMins) {
    return res.status(423).json({ error: `Bahut galat try ho gaye — ${lockedMins} minute baad try karo.` });
  }

  const email = String(req.body.email || "").toLowerCase().trim();
  const password = String(req.body.password || "");

  const ownerEmail = store.getOwnerEmail().toLowerCase();
  const ok =
    email === ownerEmail &&
    !!C.OWNER_PASSWORD_HASH &&
    (await bcrypt.compare(password, C.OWNER_PASSWORD_HASH));

  if (!ok) {
    recordFail(ip);
    return res.status(401).json({ error: "Galat email ya password." });
  }

  recordSuccess(ip);
  const token = jwt.sign({ role: "owner", email }, C.JWT_SECRET, { expiresIn: "8h" });
  res.json({ token });
});

router.get("/me", requireOwner, (req, res) => res.json({ owner: req.owner.email }));

router.put("/config", requireOwner, (req, res) => {
  const config = store.saveConfig({
    rates: req.body.rates,
    extras: req.body.extras,
    shop: req.body.shop,
  });
  res.json({ config });
});

// ---------------- payment QR (public /uploads folder — students ko dikhna chahiye) ----------------
const QR_DIR = path.join(__dirname, "..", "..", "uploads");
if (!fs.existsSync(QR_DIR)) fs.mkdirSync(QR_DIR, { recursive: true });

const qrUpload = multer({
  storage: multer.diskStorage({
    destination: (req, f, cb) => cb(null, QR_DIR),
    filename: (req, f, cb) => cb(null, `qr-${crypto.randomBytes(8).toString("hex")}${path.extname(f.originalname)}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, f, cb) => {
    const ok = f.mimetype.startsWith("image/");
    cb(ok ? null : new Error("Image file chahiye."), ok);
  },
});

router.post("/qr", requireOwner, qrUpload.single("qr"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "QR image nahi mili." });
  const qrUrl = `/uploads/${req.file.filename}`;
  store.setQrUrl(qrUrl);
  res.json({ qrUrl });
});

router.get("/orders", requireOwner, (req, res) => {
  res.json({ orders: store.getAllOrders() });
});

router.patch("/orders/:id", requireOwner, (req, res) => {
  const allowed = ["PENDING_PAYMENT", "CONFIRMED", "PRINTING", "READY", "DELIVERED"];
  const status = req.body.status;
  if (!allowed.includes(status)) return res.status(400).json({ error: "Invalid status." });

  const order = store.updateOrder(req.params.id, { status });
  if (!order) return res.status(404).json({ error: "Order nahi mila." });
  res.json({ order });
});

// Recent (abhi tak nahi kholi) aur Seen (pehle khol chuke) — dono alag-alag list hoti hain,
// taaki owner ko turant pata chale kaunsi files abhi dekhni baaki hain.
router.get("/files", requireOwner, (req, res) => {
  const all = store.getAllFiles();
  res.json({
    recent: all.filter((f) => !f.seen),
    seen: all.filter((f) => f.seen),
  });
});

router.get("/files/:id", requireOwner, (req, res) => {
  const meta = store.getFile(req.params.id);
  if (!meta) return res.status(404).json({ error: "File nahi mili." });
  const filePath = path.join(__dirname, "..", "..", "private-uploads", meta.diskName);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File disk par nahi mili." });
  store.markFileSeen(meta.id); // khulte hi "Recent" se "Seen" me chali jaayegi
  res.sendFile(filePath);
});

// ---------------- OTP codes pool ----------------
const poolUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

router.post("/otp-pool", requireOwner, poolUpload.single("file"), (req, res) => {
  let text = req.body.text || "";
  if (req.file) text = req.file.buffer.toString("utf8");
  const codes = text.match(/\d{6}/g) || [];
  res.json(store.addOtpPoolCodes(codes));
});

router.get("/otp-pool", requireOwner, (req, res) => {
  res.json(store.getOtpPoolStatus());
});

router.delete("/otp-pool", requireOwner, (req, res) => {
  store.clearOtpPool();
  res.json({ ok: true });
});

module.exports = router;
