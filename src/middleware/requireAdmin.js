// ============================================================
// requireAdmin.js — Vérifie la session admin et, si besoin, le rôle requis.
// Rôles : super_admin > gestionnaire_membres > editeur
// ============================================================
const jwt = require('jsonwebtoken');

const NIVEAUX = { editeur: 1, gestionnaire_membres: 2, super_admin: 3 };

function requireAdmin(roleMinimum = 'editeur') {
  return (req, res, next) => {
    const token = req.cookies?.session_admin;
    if (!token) {
      return res.status(401).json({ erreur: "Session administrateur absente. Merci de vous reconnecter." });
    }
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      if ((NIVEAUX[payload.role] || 0) < NIVEAUX[roleMinimum]) {
        return res.status(403).json({ erreur: "Droits insuffisants pour cette action." });
      }
      req.admin = payload;
      next();
    } catch (e) {
      return res.status(401).json({ erreur: "Session administrateur expirée. Merci de vous reconnecter." });
    }
  };
}

module.exports = requireAdmin;
