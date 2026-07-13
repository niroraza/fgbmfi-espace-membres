// ============================================================
// requireAuth.js — Vérifie que le membre a une session valide
// (cookie httpOnly signé, courte durée, cf src/routes/auth.js)
// ============================================================
const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const token = req.cookies?.session_membre;
  if (!token) {
    return res.status(401).json({ erreur: "Session expirée ou absente. Merci de vous reconnecter." });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.membre = payload; // { telephone, membreId, iat, exp }
    next();
  } catch (e) {
    return res.status(401).json({ erreur: "Session expirée ou invalide. Merci de vous reconnecter." });
  }
}

module.exports = requireAuth;
