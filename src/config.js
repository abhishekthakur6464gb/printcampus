require("dotenv").config();

const NODE_ENV = process.env.NODE_ENV || "development";

// server.js check karta hai C.CORS_ORIGIN.includes("*") — isliye ye HAMESHA array hona chahiye,
// chahe .env me "*" ho ya comma-separated domains ki list.
const CORS_ORIGIN = (process.env.CORS_ORIGIN || "*")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

module.exports = {
  PORT: Number(process.env.PORT) || 4000,
  NODE_ENV,
  DEV: NODE_ENV !== "production",
  CORS_ORIGIN,

  JWT_SECRET: process.env.JWT_SECRET,
  OTP_PEPPER: process.env.OTP_PEPPER,

  // Owner email .env ke comment ke mutabik yahin fix hai — setup-email route se badla nahi ja sakta.
  OWNER_EMAIL: "abhishekthakur6464@gmail.com",
  OWNER_PASSWORD_HASH: process.env.OWNER_PASSWORD_HASH,

  SHOP_PHONE: process.env.SHOP_PHONE || "",

  OTP_PROVIDER: process.env.OTP_PROVIDER || "console",
  OTP_SOURCE: process.env.OTP_SOURCE || "random",

  WA_TOKEN: process.env.WA_TOKEN || "",
  WA_PHONE_NUMBER_ID: process.env.WA_PHONE_NUMBER_ID || "",
  WA_TEMPLATE_NAME: process.env.WA_TEMPLATE_NAME || "otp_verification",
  WA_TEMPLATE_LANG: process.env.WA_TEMPLATE_LANG || "en",

  MSG91_AUTHKEY: process.env.MSG91_AUTHKEY || "",
  MSG91_TEMPLATE_ID: process.env.MSG91_TEMPLATE_ID || "",
  MSG91_SENDER: process.env.MSG91_SENDER || "PRNTCP",

  TWILIO_SID: process.env.TWILIO_SID || "",
  TWILIO_TOKEN: process.env.TWILIO_TOKEN || "",
  TWILIO_FROM: process.env.TWILIO_FROM || "",
};

if (NODE_ENV === "production") {
  const missing = ["JWT_SECRET", "OTP_PEPPER", "OWNER_PASSWORD_HASH"].filter(
    (k) => !process.env[k] || process.env[k].startsWith("change_me")
  );
  if (missing.length) {
    console.warn(
      `[config] Production me ye secrets .env me set nahi hain (ya default value par hain): ${missing.join(", ")}`
    );
  }
}
