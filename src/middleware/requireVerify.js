const store = require("../store");
const verify = require("../lib/verify");

// verifyToken body me ya "x-verify-token" header me aa sakta hai.
// Owner ne agar 2-step verification band kar rakhi hai (shop.verificationRequired === false),
// to sirf "x-phone" header hi kaafi hai — koi OTP zaroori nahi.
module.exports = function requireVerify(req, res, next) {
  const token = req.headers["x-verify-token"] || req.body?.verifyToken;
  const phoneHeader = req.headers["x-phone"];
  const { shop } = store.getConfig();

  if (token) {
    const phone = verify.resolve(token);
    if (!phone) return res.status(401).json({ error: "Verification expire ho gaya, dubara try karo." });
    verify.touch(token); // sliding expiry — isi session me agla order bina OTP ke chal sake
    req.phone = phone;
    return next();
  }

  if (shop.verificationRequired === false && phoneHeader) {
    req.phone = String(phoneHeader);
    return next();
  }

  return res.status(401).json({ error: "Pehle OTP verify karo." });
};
