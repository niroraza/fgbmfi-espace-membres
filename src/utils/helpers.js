const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// Normalise un numéro saisi en format E.164 basique (France par défaut).
// Ex: "06 00 00 00 00" -> "+33600000000" ; "+33 6 00 00 00 00" -> "+33600000000"
function normaliserTelephone(saisie) {
  if (!saisie) return null;
  let t = saisie.replace(/[\s().-]/g, '');
  if (t.startsWith('00')) t = '+' + t.slice(2);
  if (t.startsWith('0') && t.length === 10) t = '+33' + t.slice(1);
  if (!t.startsWith('+')) return null;
  if (!/^\+[1-9]\d{7,14}$/.test(t)) return null;
  return t;
}

function genererCodeOtp() {
  // Code à 6 chiffres, générateur cryptographiquement sûr
  return crypto.randomInt(0, 1000000).toString().padStart(6, '0');
}

// Masque un numéro pour affichage/filigrane : +33600000000 -> "•••• 4582"
function masquerTelephone(tel) {
  if (!tel) return '••••';
  const fin = tel.slice(-4);
  return `•••• ${fin}`;
}

// --- Jetons signés courte durée pour l'accès au PDF ---
function creerTokenPdf(payload) {
  return jwt.sign(payload, process.env.PDF_TOKEN_SECRET, {
    expiresIn: `${process.env.PDF_TOKEN_TTL_SECONDS || 90}s`,
  });
}
function verifierTokenPdf(token) {
  return jwt.verify(token, process.env.PDF_TOKEN_SECRET);
}

module.exports = { normaliserTelephone, genererCodeOtp, masquerTelephone, creerTokenPdf, verifierTokenPdf };
