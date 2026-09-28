const router = require("express").Router();
const crypto = require("crypto");
const C = require("../config");
const store = require("../store");
const requireVerify = require("../middleware/requireVerify");
const { computeQuote } = require("../lib/pricing");
const { sendWhatsAppText } = require("../lib/whatsapp");

function genOrderId() {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `PC-${d}-${crypto.randomInt(1000, 9999)}`;
}

// Public — rates, extras, offer, QR URL
router.get("/config", (req, res) => {
  const { rates, extras, shop } = store.getConfig();
  res.json({ rates, extras, shop });
});

// Public — live total, server-calculated (devtools se badla nahi ja sakta)
router.post("/quote", (req, res) => {
  const { rates, extras, shop } = store.getConfig();
  res.json(computeQuote(req.body, rates, extras, shop));
});

// verifyToken required — order banao
router.post("/", requireVerify, (req, res) => {
  const { rates, extras, shop } = store.getConfig();
  const q = computeQuote(req.body, rates, extras, shop);

  const files = Array.isArray(req.body.files) ? req.body.files : [];
  if (!files.length) return res.status(400).json({ error: "Files pehle upload karo." });

  const name = String(req.body.name || "").trim();
  if (name.length < 2) return res.status(400).json({ error: "Naam likho." });

  const id = genOrderId();
  const order = {
    id,
    name,
    phone: req.phone,
    notes: String(req.body.notes || ""),
    files,
    job: q.job,
    price: {
      docPages: q.docPages,
      images: q.images,
      copies: q.copies,
      printing: q.printing,
      addons: q.addons,
      discount: q.discount,
      discountPct: q.discountPct,
      total: q.total,
      advance: q.advance,
      balance: q.balance,
    },
    payment: { paid: 0, utr: null },
    status: "PENDING_PAYMENT",
    createdAt: new Date().toISOString(),
  };

  store.createOrder(order);
  store.linkFilesToOrder(
    files.map((f) => f.id),
    id
  );

  res.status(201).json({ order });
});

// verifyToken required — 50% advance ka UTR submit + shop notification
router.post("/:id/payment", requireVerify, (req, res) => {
  const order = store.getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: "Order nahi mila." });
  if (order.phone !== req.phone) return res.status(403).json({ error: "Ye order tumhara nahi hai." });

  const utr = String(req.body.utr || "").trim();
  if (!/^[A-Za-z0-9]{8,24}$/.test(utr)) {
    return res.status(400).json({ error: "Valid UTR/Transaction ID do (8-24 characters)." });
  }

  // Ek UTR sirf ek hi order me use ho sakta hai — same screenshot/transaction ID dobara
  // bhejkar doosra order "confirm" karwana yahan par hi ruk jaata hai.
  const duplicate = store.findOrderByUtr(utr, order.id);
  if (duplicate) {
    return res.status(409).json({
      error: `Ye UTR pehle se order ${duplicate.id} me use ho chuka hai. Har payment ka apna alag UTR hota hai — sahi transaction ID daalo.`,
    });
  }

  const updated = store.updateOrder(order.id, {
    payment: { paid: order.price.advance, utr },
    status: "CONFIRMED",
  });

  notifyShop(updated).catch((e) => console.error("Shop notify fail:", e.message));

  res.json({ order: updated });
});

async function notifyShop(order) {
  // 1) Shop ko naya order aane ki WhatsApp notification
  const shopMsg =
    `🖨️ Naya PrintCampus order!\n` +
    `Order: ${order.id}\n` +
    `Student: ${order.name} (+${order.phone})\n` +
    `Job: ${order.job.printType}, ${order.job.sides}, ${order.price.docPages} pages × ${order.price.copies} copies\n` +
    `Total: ₹${order.price.total} | Advance paid: ₹${order.payment.paid} | UTR: ${order.payment.utr}`;

  // 2) Student ko order-confirmation — ye hi wo "confirmation message" hai jo payment ke
  // turant baad chala jaata hai, taaki dubara OTP/2-step verification na maangna pade —
  // ye WhatsApp message hi student ke liye confirmation ka saboot ban jaata hai.
  const studentMsg =
    `✅ PrintCampus order confirm ho gaya!\n` +
    `Order ID: ${order.id}\n` +
    `Total: ₹${order.price.total} | Abhi paid: ₹${order.payment.paid} | Pickup par baaki: ₹${order.price.balance}\n` +
    `Apna Order ID shop me dikha kar prints le lena. Dhanyawad!`;

  if (!C.WA_TOKEN || !C.WA_PHONE_NUMBER_ID) {
    // Credentials set nahi hain — console me hi dikha do taaki dev/testing me trace mile,
    // production me .env fill karte hi ye असली WhatsApp message ban jaayega, code same rahega.
    console.log(`[SHOP NOTIFY - console fallback]\n${shopMsg}`);
    console.log(`[STUDENT CONFIRM - console fallback]\n${studentMsg}`);
    return;
  }

  try {
    if (C.SHOP_PHONE) await sendWhatsAppText(C.SHOP_PHONE, shopMsg);
  } catch (e) {
    console.error("Shop ko WhatsApp notify karne me fail:", e.message);
  }
  try {
    await sendWhatsAppText(order.phone, studentMsg);
  } catch (e) {
    console.error("Student ko WhatsApp confirmation bhejne me fail:", e.message);
  }
}

module.exports = router;
