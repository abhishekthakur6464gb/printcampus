const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const C = require("./src/config");

const app = express();                       // <-- app SABSE PEHLE banta hai
app.set("trust proxy", 1);

app.use(helmet({
  contentSecurityPolicy: false               // CDN scripts (fonts, pdf.js) block na ho isliye off
}));

app.use(express.json({ limit: "1mb" }));
app.use(cors({
  // config.js me CORS_ORIGIN hamesha ek ARRAY hai, string kabhi nahi —
  // isliye seedha .includes("*") check karo, typeof string wala check galat tha.
  origin: C.CORS_ORIGIN.includes("*") ? true : C.CORS_ORIGIN,
  methods: ["GET", "POST", "PUT", "PATCH"]
}));

/** Simple per-IP rate limit — brute force aur spam rokne ke liye. */
const hits = new Map();
app.use((req, res, next) => {
  const ip = req.ip, now = Date.now();
  const list = (hits.get(ip) || []).filter(t => now - t < 60_000);
  list.push(now); hits.set(ip, list);
  if (list.length > 60) return res.status(429).json({ error: "Bahut zyada requests. Thodi der baad try karo." });
  next();
});

app.use("/uploads", express.static(path.join(__dirname, "uploads")));
// assets/ = repo me committed permanent files (jaise default payment QR) — Render restart/redeploy
// hone par bhi ye gayab nahi hote, kyunki ye actual code ka hissa hain, runtime upload nahi.
app.use("/assets", express.static(path.join(__dirname, "assets")));
app.use("/api/otp", require("./src/routes/otp"));
app.use("/api/files", require("./src/routes/upload"));
app.use("/api/admin", require("./src/routes/admin"));
app.use("/api/orders", require("./src/routes/orders"));
app.get("/api/health", (req, res) => res.json({ ok: true, provider: C.OTP_PROVIDER, dev: C.DEV }));

// Frontend ka naam yahan "index.html" hai (tumhare upload ke mutabik) —
// agar iska naam badal kar printcampus-connected.html rakha to yahan bhi wahi likhna.
app.get("/", (req, res) => {
  // Dev/testing me browser purana index.html cache na kar le, isliye no-store —
  // warna file badalne/server restart karne ke baad bhi purana UI dikhta rahega.
  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.sendFile(path.join(__dirname, "index.html"));
});

app.use((req, res) => res.status(404).json({ error: "Route nahi mila." }));
app.use((err, req, res, next) => {
  if (!err.status) console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : "Server error." });
});

app.listen(C.PORT, () => {
  console.log(`PrintCampus backend -> http://localhost:${C.PORT}`);
  if (C.DEV) console.log("DEV mode: OTP console par print hoga aur response me bhi aayega.");
});
