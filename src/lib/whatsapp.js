// OTP ka message ek approved TEMPLATE se jaata hai (Meta ki policy — business-initiated
// pehla message hamesha template hi ho sakta hai). Lekin order-confirmation student ke
// OTP request ke turant baad jaata hai, jab session already open hota hai — isliye wahan
// ek simple free-text message bhejna allowed hai, koi template nahi chahiye.
const C = require("../config");

async function sendWhatsAppText(to, body) {
  if (!C.WA_TOKEN || !C.WA_PHONE_NUMBER_ID) {
    throw new Error("WhatsApp credentials missing");
  }
  const url = `https://graph.facebook.com/v19.0/${C.WA_PHONE_NUMBER_ID}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body },
  };
  const r = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${C.WA_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const detail = await r.text().catch(() => "");
    throw new Error(`WhatsApp API error ${r.status} ${detail}`.trim());
  }
}

module.exports = { sendWhatsAppText };
