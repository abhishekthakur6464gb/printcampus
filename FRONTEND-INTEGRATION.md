# printcampus.html ko backend se jodna

Frontend ke 5 jagah badalni hain. Baaki HTML/CSS jaisa hai waisa hi rahega.

```js
const API = "http://localhost:4000/api";   // deploy ke baad apna domain
let verifyToken = null;
```

### 1. Rates localStorage ki jagah server se

```js
async function loadConfig() {
  const c = await fetch(`${API}/orders/config`).then(r => r.json());
  rates = c.rates; extras = c.extras; shop = c.shop;
  renderPromo(); renderExtras(); renderRateCard(); quote();
}
```
Owner ne rate ya 15% offer badla — har student ko turant dikhega, chahe wo kisi bhi device par ho.

### 2. Total server se (browser calculation sirf preview)

```js
async function quote() {
  const body = {
    pdfPages, images, copies: +v("copies"), printType: v("printType"),
    sides: v("sides"), paper: v("paper"), layout: +v("layout"),
    binding: v("binding"), range: v("pages"), extras: checkedExtraNames()
  };
  const p = await fetch(`${API}/orders/quote`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  }).then(r => r.json());
  set("bTotal", money(p.total)); set("bAdv", money(p.advance));
}
```

### 3. OTP — ab generate nahi, request hoti hai

```js
async function sendOtp(phone) {
  const r = await fetch(`${API}/otp/send`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "91" + phone })
  }).then(r => r.json());
  if (r.error) return msg("verifyMsg", r.error, "bad");
  msg("demoOtp", "OTP tumhare WhatsApp par bhej diya gaya hai.", "info");
}

async function checkOtp() {
  const r = await fetch(`${API}/otp/verify`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "91" + order.phone, code: v("otpInput") })
  }).then(r => r.json());
  if (!r.verifyToken) return msg("verifyMsg", r.error, "bad");
  verifyToken = r.verifyToken;      // step 1 cleared
  showStepB();
}
```
`demoOtp` wala box aur `otp` variable pura hata do — ab code browser me exist hi nahi karta.

### 4. Files aur order

```js
const fd = new FormData();
selectedFiles.forEach(f => fd.append("files", f));
fd.append("verifyToken", verifyToken);
const up = await fetch(`${API}/files`, {
  method: "POST", headers: { "x-verify-token": verifyToken }, body: fd
}).then(r => r.json());

const res = await fetch(`${API}/orders`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ verifyToken, name, files: up.files, ...jobOptions })
}).then(r => r.json());
order = res.order;    // total aur advance ab server ke hain
```

Payment step:
```js
await fetch(`${API}/orders/${order.id}/payment`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ verifyToken, utr: v("utr") })
});
```
Shop ko WhatsApp notification server khud bhej deta hai — `wa.me` link ab optional backup hai.

### 5. Owner panel — PIN ki jagah login

```js
async function unlockOwner() {
  const r = await fetch(`${API}/admin/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: v("ownerUser"), password: v("ownerPass") })
  }).then(r => r.json());
  if (!r.token) return msg("lockMsg", "Galat username ya password.", "bad");
  sessionStorage.setItem("pc_token", r.token);   // 8 ghante
  showOwner();
}

async function saveRates() {
  await fetch(`${API}/admin/config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json",
               Authorization: "Bearer " + sessionStorage.getItem("pc_token") },
    body: JSON.stringify({ rates, extras, shop })
  });
}
```
QR upload `POST /api/admin/qr` par `FormData` field `qr` ke saath, wahi JWT header lagakar.

---

**Yaad rakho:** owner panel ka HTML chhupa dena security nahi hai — asli guard `requireOwner` middleware hai, jo har admin request par JWT check karta hai. Frontend sirf UI hide karta hai.
