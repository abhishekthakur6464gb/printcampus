const jwt = require("jsonwebtoken");
const C = require("../config");

module.exports = function requireOwner(req, res, next) {
  const auth = req.headers.authorization || "";
  const headerToken = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  // File-view links seedha naye browser tab me khulte hain (custom fetch/blob/iframe nahi) —
  // wahan Authorization header bhej nahi sakte, isliye query param ?token= bhi accept karte hain.
  const token = headerToken || req.query.token;
  if (!token) return res.status(401).json({ error: "Login zaroori hai." });

  try {
    const payload = jwt.verify(token, C.JWT_SECRET);
    if (payload.role !== "owner") throw new Error("bad role");
    req.owner = { email: payload.email };
    next();
  } catch {
    return res.status(401).json({ error: "Session expire ho gaya, dubara login karo." });
  }
};
