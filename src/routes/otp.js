const router = require("express").Router();
const crypto = require("crypto");
const C = require("../config");
const store = require("../store");
const verify = require("../lib/verify");

// phone -> { hash, expires, attempts }  — plain OTP kabhi store nahi hota
const otpRecords = new Map();
// phone -> { last, count, hourStart } — resend cooldown + hourly cap
const sendLimits = new Map();

function hmac(phone, code) {
  return crypto.createHmac("sha256", C.OTP_PEPPER).update(`${phone}:${code}`).digest("hex");
}

function checkSendLimit(phone) {
  const now = Date.now();
  const rec = sendLimits.get(phone) || { last: 0, count: 0, hourStart: now };
  if (now - rec.last < 60_000) {
    return { ok: false, error: "60 second wait karo dubara OTP bhejne se pehle." };
  }
  if (now - rec.hourStart > 60 * 60 * 1000) {
    rec.count = 0;
    rec.hourStart = now;
  }
  if (rec.count >= 5) {
    return { ok: false, error: "Is number par 1 ghante me bahut zyada OTP bhej diye. Thodi der baad try karo." };
  }
  rec.count += 1;
  rec.last = now;
  sendLimits.set(phone, rec);
  return { ok: true };
}

async function sendWhatsApp(phone, code) {
  const url = `https://graph.facebook.com/v19.0/${C.WA_PHONE_NUMBER_ID}/messages`;
  const body = {
    messaging_product: "whatsapp",
    to: phone,
    type: "template",
    template: {
      name: C.WA_TEMPLATE_NAME,
      language: { code: C.WA_TEMPLATE_LANG },
      components: [{ type: "body", parameters: [{ type: "text", text: code }] }],
    },
  };
  const r = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${C.WA_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("WhatsApp API error " + r.status);
}

async function sendMsg91(phone, code) {
  const url = `https://control.msg91.com/api/v5/otp?otp=${code}&mobile=${phone}&authkey=${C.MSG91_AUTHKEY}&template_id=${C.MSG91_TEMPLATE_ID}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("MSG91 API error " + r.status);
}

async function sendTwilio(phone, code) {
  const auth = Buffer.from(`${C.TWILIO_SID}:${C.TWILIO_TOKEN}`).toString("base64");
  const url = `https://api.twilio.com/2010-04-01/Accounts/${C.TWILIO_SID}/Messages.json`;
  const params = new URLSearchParams({ To: "+" + phone, From: C.TWILIO_FROM, Body: `PrintCampus OTP: ${code}` });
  const r = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  if (!r.ok) throw new Error("Twilio API error " + r.status);
}

async function deliver(phone, code) {
  if (C.OTP_SOURCE === "phone") {
    // Kuch bheja nahi jaata — frontend khud last-6-digits samajh leta hai (setup-free local testing).
    return { derived: true };
  }

  if (C.OTP_PROVIDER === "console" || C.DEV) {
    console.log(`[OTP] ${phone} -> ${code}`);
  }

  try {
    if (C.OTP_PROVIDER === "whatsapp") {
      if (!C.WA_TOKEN || !C.WA_PHONE_NUMBER_ID) throw new Error("WhatsApp credentials missing");
      await sendWhatsApp(phone, code);
    } else if (C.OTP_PROVIDER === "msg91") {
      if (!C.MSG91_AUTHKEY || !C.MSG91_TEMPLATE_ID) throw new Error("MSG91 credentials missing");
      await sendMsg91(phone, code);
    } else if (C.OTP_PROVIDER === "twilio") {
      if (!C.TWILIO_SID || !C.TWILIO_TOKEN || !C.TWILIO_FROM) throw new Error("Twilio credentials missing");
      await sendTwilio(phone, code);
    }
    return { devCode: C.DEV ? code : undefined };
  } catch (e) {
    // Credentials adhoore hon to kabhi block nahi karte — console-fallback me dikha dete hain.
    console.error("OTP delivery failed, console-fallback:", e.message);
    return { sendFailed: true, devCode: code };
  }
}

router.post("/send", async (req, res) => {
  const phone = String(req.body.phone || "").replace(/\D/g, "");
  if (!/^91[6-9]\d{9}$/.test(phone)) {
    return res.status(400).json({ error: "Sahi 91-prefixed WhatsApp number bhejo." });
  }

  const limit = checkSendLimit(phone);
  if (!limit.ok) return res.status(429).json({ error: limit.error });

  let code;
  if (C.OTP_SOURCE === "pool") {
    code = store.popOtpPoolCode();
    if (!code) {
      // Pool khaali hai — poori tarah block karne ke bajaye "random" par fallback karo,
      // taaki owner ke codes upload karna bhoolne par bhi students order kar sakein.
      console.warn("[OTP] Pool khaali hai, is baar random code use kar rahe hain — owner ko OTP Codes Pool me naye codes daalne chahiye.");
      code = String(crypto.randomInt(100000, 999999));
    }
  } else if (C.OTP_SOURCE === "phone") {
    code = phone.slice(-6);
  } else {
    code = String(crypto.randomInt(100000, 999999));
  }

  otpRecords.set(phone, { hash: hmac(phone, code), expires: Date.now() + 5 * 60 * 1000, attempts: 0 });

  const result = await deliver(phone, code);
  res.json({ ok: true, ...result });
});

router.post("/verify", (req, res) => {
  const phone = String(req.body.phone || "").replace(/\D/g, "");
  const code = String(req.body.code || "").trim();
  const rec = otpRecords.get(phone);

  if (!rec) return res.status(400).json({ error: "Pehle OTP mangwao." });
  if (Date.now() > rec.expires) {
    otpRecords.delete(phone);
    return res.status(400).json({ error: "OTP expire ho gaya, naya mangwao." });
  }
  if (rec.attempts >= 5) {
    otpRecords.delete(phone);
    return res.status(429).json({ error: "Bahut galat attempts, naya OTP mangwao." });
  }

  const candidate = Buffer.from(hmac(phone, code));
  const stored = Buffer.from(rec.hash);
  const match = candidate.length === stored.length && crypto.timingSafeEqual(candidate, stored);

  if (!match) {
    rec.attempts += 1;
    if (rec.attempts >= 5) otpRecords.delete(phone);
    return res.status(400).json({ error: "Galat OTP." });
  }

  otpRecords.delete(phone);
  const verifyToken = verify.issue(phone);
  res.json({ ok: true, verifyToken });
});

module.exports = router;
