// ============================================================
// rateLimit.js — Limitations par adresse IP (première ligne de défense).
// La limite "métier" (3 SMS/jour par numéro) est gérée séparément
// dans src/routes/auth.js, rattachée au numéro de téléphone et non
// seulement à l'IP (recommandation OWASP : combiner compte + IP + appareil).
// ============================================================
const rateLimit = require('express-rate-limit');

// Limite large sur toute l'API (protection générale anti-flood)
const limiteGenerale = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erreur: "Trop de requêtes. Merci de réessayer plus tard." },
});

// Limite stricte sur la demande de code OTP (par IP)
const limiteDemandeOtp = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 8, // au-delà : IP suspecte, indépendamment du numéro visé
  standardHeaders: true,
  legacyHeaders: false,
  message: { erreur: "Trop de tentatives depuis cette connexion. Merci de réessayer plus tard." },
});

// Limite stricte sur la vérification de code (par IP)
const limiteVerifOtp = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erreur: "Trop de tentatives. Merci de réessayer plus tard." },
});

// Limite sur la connexion admin
const limiteAdminLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erreur: "Trop de tentatives de connexion. Merci de réessayer plus tard." },
});

module.exports = { limiteGenerale, limiteDemandeOtp, limiteVerifOtp, limiteAdminLogin };
