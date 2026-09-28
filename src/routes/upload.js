const router = require("express").Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const requireVerify = require("../middleware/requireVerify");
const store = require("../store");

const UPLOAD_DIR = path.join(__dirname, "..", "..", "private-uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const id = crypto.randomBytes(12).toString("hex");
    cb(null, `${id}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024, files: 10 },
  fileFilter: (req, file, cb) => {
    const ok = file.mimetype === "application/pdf" || file.mimetype.startsWith("image/");
    cb(ok ? null : new Error("Sirf PDF ya image files allowed hain."), ok);
  },
});

router.post("/", requireVerify, upload.array("files", 10), (req, res) => {
  if (!req.files || !req.files.length) return res.status(400).json({ error: "Koi file mili nahi." });

  const saved = req.files.map((f) => {
    const id = path.basename(f.filename, path.extname(f.filename));
    const kind = f.mimetype === "application/pdf" ? "pdf" : "image";
    const meta = {
      id,
      name: f.originalname,
      size: f.size,
      kind,
      diskName: f.filename,
      phone: req.phone,
      order: null,
      seen: false,
      uploadedAt: new Date().toISOString(),
    };
    store.saveFile(meta);
    return { id, name: meta.name, size: meta.size, kind };
  });

  res.json({ files: saved });
});

module.exports = router;
