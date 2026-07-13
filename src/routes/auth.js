// ============================================================
// routes/auth.js — Connexion des membres par téléphone + code OTP
// Parcours : demander-code -> SMS -> verifier-code -> session
// ============================================================
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { envoyerSMS } = require('../sms');
const { normaliserTelephone, genererCodeOtp } = require('../utils/helpers');
const { limiteDemandeOtp, limiteVerifOtp } = require('../middleware/rateLimit');

const router = express.Router();

const OTP_MAX_PAR_JOUR = parseInt(process.env.OTP_MAX_PAR_JOUR || '3', 10);
const OTP_DELAI_MIN_SECONDES = parseInt(process.env.OTP_DELAI_MIN_SECONDES || '60', 10);
const OTP_VALIDITE_MINUTES = parseInt(process.env.OTP_VALIDITE_MINUTES || '5', 10);
const OTP_TENTATIVES_MAX = parseInt(process.env.OTP_TENTATIVES_MAX || '3', 10);
const OTP_BLOCAGE_MINUTES = parseInt(process.env.OTP_BLOCAGE_MINUTES || '30', 10);

function estBloque(telephone) {
  const row = db.prepare(
    `SELECT * FROM blocages WHERE telephone = ? AND bloque_jusqua > datetime('now') ORDER BY bloque_jusqua DESC LIMIT 1`
  ).get(telephone);
  return row || null;
}

function logSession(telephone, ip, userAgent, action) {
  db.prepare(`INSERT INTO sessions_log (telephone, ip, user_agent, action) VALUES (?, ?, ?, ?)`)
    .run(telephone, ip, userAgent, action);
}

// --- Étape 1 : demande de code ---
router.post('/demander-code', limiteDemandeOtp, async (req, res) => {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const telephone = normaliserTelephone(req.body?.telephone);

  // Message volontairement neutre : ne révèle jamais si le numéro existe ou non
  const reponseNeutre = { message: "Si ce numéro est reconnu, un code de vérification vous sera envoyé." };

  if (!telephone) {
    // Format invalide : on répond quand même de façon neutre (pas d'info exploitable)
    return res.json(reponseNeutre);
  }

  const blocage = estBloque(telephone);
  if (blocage) {
    logSession(telephone, ip, req.headers['user-agent'], 'demande_code_pendant_blocage');
    return res.json(reponseNeutre);
  }

  const membre = db.prepare(`SELECT * FROM membres WHERE telephone = ? AND actif = 1`).get(telephone);
  if (!membre) {
    logSession(telephone, ip, req.headers['user-agent'], 'demande_code_numero_inconnu');
    return res.json(reponseNeutre); // ne pas révéler l'absence du numéro
  }
  if (membre.date_expiration_acces && membre.date_expiration_acces < new Date().toISOString()) {
    logSession(telephone, ip, req.headers['user-agent'], 'demande_code_acces_expire');
    return res.json(reponseNeutre);
  }

  // Limite : 3 envois / 24h par numéro
  const envoisAuj = db.prepare(
    `SELECT COUNT(*) AS n FROM otp_envois WHERE telephone = ? AND envoye_le > datetime('now', '-24 hours')`
  ).get(telephone).n;
  if (envoisAuj >= OTP_MAX_PAR_JOUR) {
    logSession(telephone, ip, req.headers['user-agent'], 'demande_code_limite_journaliere_atteinte');
    return res.status(429).json({
      erreur: "Le nombre maximal de demandes autorisées a été atteint. Vous pourrez renouveler votre demande ultérieurement ou contacter l'administration.",
    });
  }

  // Délai minimum entre deux envois
  const dernierEnvoi = db.prepare(
    `SELECT envoye_le FROM otp_envois WHERE telephone = ? ORDER BY envoye_le DESC LIMIT 1`
  ).get(telephone);
  if (dernierEnvoi) {
    const secondesEcoulees = (Date.now() - new Date(dernierEnvoi.envoye_le + 'Z').getTime()) / 1000;
    if (secondesEcoulees < OTP_DELAI_MIN_SECONDES) {
      return res.json(reponseNeutre); // on ne renvoie pas d'erreur explicite (anti-énumération de timing)
    }
  }

  // Génération et envoi du code
  const code = genererCodeOtp();
  const codeHash = await bcrypt.hash(code, 10);
  const expireLe = new Date(Date.now() + OTP_VALIDITE_MINUTES * 60000).toISOString();

  // Invalide les codes précédents non utilisés pour ce numéro
  db.prepare(`UPDATE otp_codes SET utilise = 1 WHERE telephone = ? AND utilise = 0`).run(telephone);
  db.prepare(`INSERT INTO otp_codes (telephone, code_hash, expire_le) VALUES (?, ?, ?)`).run(telephone, codeHash, expireLe);
  db.prepare(`INSERT INTO otp_envois (telephone, ip) VALUES (?, ?)`).run(telephone, ip);

  try {
    const resultat = await envoyerSMS(telephone, code);
    logSession(telephone, ip, req.headers['user-agent'], 'code_envoye');
    // En mode mock, on renvoie le code dans la réponse pour faciliter les tests
    // (JAMAIS fait en mode "twilio" / production réelle).
    if (resultat.mode === 'mock') {
      return res.json({ ...reponseNeutre, modeTest: true, codeDeTest: resultat.codeVisible });
    }
    return res.json(reponseNeutre);
  } catch (e) {
    console.error('[auth] échec envoi SMS:', e.message);
    return res.status(500).json({ erreur: "Une erreur technique est survenue lors de l'envoi du code. Merci de réessayer." });
  }
});

// --- Étape 2 : vérification du code ---
router.post('/verifier-code', limiteVerifOtp, async (req, res) => {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const telephone = normaliserTelephone(req.body?.telephone);
  const code = (req.body?.code || '').trim();

  if (!telephone || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ erreur: "Code invalide. Merci de vérifier votre saisie." });
  }

  const blocage = estBloque(telephone);
  if (blocage) {
    return res.status(423).json({
      erreur: `Accès temporairement bloqué suite à plusieurs codes incorrects. Merci de réessayer après ${OTP_BLOCAGE_MINUTES} minutes ou de contacter l'administration.`,
    });
  }

  const otp = db.prepare(
    `SELECT * FROM otp_codes WHERE telephone = ? AND utilise = 0 AND expire_le > datetime('now') ORDER BY id DESC LIMIT 1`
  ).get(telephone);

  if (!otp) {
    logSession(telephone, ip, req.headers['user-agent'], 'echec_code_expire_ou_absent');
    return res.status(400).json({ erreur: "Ce code a expiré ou n'existe pas. Merci de demander un nouveau code." });
  }

  const valide = await bcrypt.compare(code, otp.code_hash);

  if (!valide) {
    const nouvellesTentatives = otp.tentatives_echouees + 1;
    db.prepare(`UPDATE otp_codes SET tentatives_echouees = ? WHERE id = ?`).run(nouvellesTentatives, otp.id);
    logSession(telephone, ip, req.headers['user-agent'], 'echec_code_incorrect');

    if (nouvellesTentatives >= OTP_TENTATIVES_MAX) {
      const bloqueJusqua = new Date(Date.now() + OTP_BLOCAGE_MINUTES * 60000).toISOString();
      db.prepare(`INSERT INTO blocages (telephone, bloque_jusqua, raison) VALUES (?, ?, ?)`)
        .run(telephone, bloqueJusqua, 'trop_de_codes_incorrects');
      db.prepare(`UPDATE otp_codes SET utilise = 1 WHERE id = ?`).run(otp.id);
      logSession(telephone, ip, req.headers['user-agent'], 'blocage_active');
      return res.status(423).json({
        erreur: `Trop de codes incorrects. Accès bloqué pendant ${OTP_BLOCAGE_MINUTES} minutes.`,
      });
    }
    return res.status(400).json({
      erreur: "Code incorrect.",
      tentativesRestantes: OTP_TENTATIVES_MAX - nouvellesTentatives,
    });
  }

  // Code valide : ouverture de session
  db.prepare(`UPDATE otp_codes SET utilise = 1 WHERE id = ?`).run(otp.id);
  const membre = db.prepare(`SELECT * FROM membres WHERE telephone = ?`).get(telephone);
  db.prepare(`UPDATE membres SET date_derniere_connexion = datetime('now') WHERE id = ?`).run(membre.id);
  logSession(telephone, ip, req.headers['user-agent'], 'connexion_reussie');

  const dureeHeures = parseInt(process.env.SESSION_DURATION_HOURS || '2', 10);
  const token = jwt.sign(
    { membreId: membre.id, telephone: membre.telephone, prenom: membre.prenom },
    process.env.JWT_SECRET,
    { expiresIn: `${dureeHeures}h` }
  );

  res.cookie('session_membre', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: dureeHeures * 3600 * 1000,
  });

  res.json({ message: "Connexion réussie.", prenom: membre.prenom });
});

router.post('/deconnexion', (req, res) => {
  res.clearCookie('session_membre');
  res.json({ message: "Vous avez été déconnecté de l'espace sécurisé." });
});

module.exports = router;
