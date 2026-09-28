// verifyToken sirf 20 minute chalta hai aur sirf process memory me rehta hai —
// server restart hone par sab expire ho jaate hain, jo iske use-case (ek order flow) ke liye theek hai.
const crypto = require("crypto");

const tokens = new Map(); // token -> { phone, expires }
// verifyToken ab 24 ghante tak valid rehta hai (pehle sirf 20 minute) — ek baar OTP verify
// hone ke baad, student poore din bhar bina dubara OTP diye order kar sakta hai. Har order
// par touch() se ye window aur aage khisak jaati hai, jab tak wo poori tarah inactive na ho.
// Isi wajah se ab payment ke baad ka WhatsApp confirmation message hi asli "trust signal"
// ban jaata hai — baar baar OTP maangne ki zaroorat nahi rehti.
const TTL_MS = 24 * 60 * 60 * 1000;

function issue(phone) {
  const token = crypto.randomBytes(24).toString("hex");
  tokens.set(token, { phone, expires: Date.now() + TTL_MS });
  return token;
}

function resolve(token) {
  const rec = tokens.get(token);
  if (!rec) return null;
  if (Date.now() > rec.expires) {
    tokens.delete(token);
    return null;
  }
  return rec.phone;
}

// Har baar successfully use hone par expiry ko 20 minute aage khiska do (sliding window) —
// isi se ek student agar lagataar 2-3 order 20 minute ke andar-andar karta hai to use
// har baar dubara OTP nahi karwana padta, jab tak wo poori tarah inactive na ho jaaye.
function touch(token) {
  const rec = tokens.get(token);
  if (rec) rec.expires = Date.now() + TTL_MS;
}

module.exports = { issue, resolve, touch };
