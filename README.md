# PrintCampus Backend

Frontend (`printcampus.html`) ke liye secure backend. Ye teen cheezein browser se hata kar server par le aata hai:

| Pehle (browser me) | Ab (server par) |
|---|---|
| OTP JS me generate hota tha aur screen par dikhta tha | OTP server par banta hai, HMAC hash hoke store hota hai, WhatsApp/SMS se jaata hai |
| Owner PIN JS me likha tha | bcrypt password hash + JWT session (8 ghante) |
| Total browser me calculate hota tha (devtools se badal sakta tha) | Price hamesha server calculate karta hai |

---

## 1. Setup (5 minute)

```bash
cd printcampus-backend
npm install
cp .env.example .env
```

Secrets generate karo:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # JWT_SECRET
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # OTP_PEPPER
npm run hash -- "MeraStrongPassword123"                                     # OWNER_PASSWORD_HASH
```

Teeno values `.env` me paste karo, phir:

```bash
npm run dev      # http://localhost:4000
```

Development me `OTP_PROVIDER=console` — OTP terminal par print hota hai aur API response me `devCode` aata hai. **Production me ye apne aap band ho jaata hai** (`NODE_ENV=production`).

---

## 2. OTP provider chuno

`.env` me `OTP_PROVIDER` set karo:

**`whatsapp`** — Meta WhatsApp Cloud API. Free tier hai, par ek approved **Authentication template** chahiye (Meta Business Manager → Message Templates)। `WA_TOKEN`, `WA_PHONE_NUMBER_ID` bharo. Isi se shop ko order notification bhi apne aap chala jaata hai.

**`msg91`** — India SMS, sabse sasta aur sabse jaldi setup hota hai. DLT registration + template ID chahiye.

**`twilio`** — International SMS, setup aasaan, rate mehnga.

Provider badalne par baaki code me kuch nahi badalna — sirf env value.

---

## 3. API

| Method | Route | Auth | Kaam |
|---|---|---|---|
| GET | `/api/orders/config` | — | rates, extras, offer, QR URL |
| POST | `/api/orders/quote` | — | live total (server calculated) |
| POST | `/api/otp/send` | — | OTP bhejo (`{phone}`) |
| POST | `/api/otp/verify` | — | OTP check → `verifyToken` (24 hours, sliding — student ko baar-baar OTP nahi karna padta; payment ke baad WhatsApp confirmation hi asli trust signal hai) |
| POST | `/api/files` | verifyToken | PDF/image upload |
| POST | `/api/orders` | verifyToken | order banao, price server se |
| POST | `/api/orders/:id/payment` | verifyToken | 50% advance ka UTR + shop notification |
| POST | `/api/admin/login` | — | owner JWT |
| PUT | `/api/admin/config` | owner JWT | rates / extras / offer / advance % |
| POST | `/api/admin/qr` | owner JWT | payment QR upload |
| GET | `/api/admin/orders` | owner JWT | saare orders |
| PATCH | `/api/admin/orders/:id` | owner JWT | status: PRINTING / READY / DELIVERED |

### OTP security jo pehle nahi tha
- Plain OTP kabhi store nahi hota — sirf `HMAC-SHA256(phone:code, OTP_PEPPER)`
- 5 minute expiry, one-time use
- 5 galat attempt par OTP dead
- 60 second resend cooldown, 5 OTP per number per hour
- `crypto.timingSafeEqual` se compare (timing attack se bachav)
- Order me phone client se nahi, **token se** liya jaata hai — koi doosre ke number par order nahi bana sakta

---

## 4. Deploy

Render / Railway / Fly.io par direct chal jaayega:
- Build: `npm install`, Start: `npm start`
- `.env` ki saari values dashboard ke Environment section me daalo
- `NODE_ENV=production` aur `CORS_ORIGIN` me apni website ka asli domain
- `data/` aur `uploads/` ke liye persistent disk lagao, warna restart par data udd jayega

## 5. Database upgrade

Abhi `src/store.js` ek JSON file use karta hai — college project ke liye kaafi hai. Firestore ya MongoDB par jaana ho to sirf `store.js` ke `get/save/update` badlo, baaki koi file touch nahi hogi.

Firestore version:
```js
const { getFirestore } = require("firebase-admin/firestore");
const db = getFirestore();
// db.collection("orders").doc(id).set(order)
// db.collection("config").doc("main").get()
```
