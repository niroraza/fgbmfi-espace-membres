// ============================================================
// routes/admin.js — Interface d'administration
// Rôles : super_admin > gestionnaire_membres > editeur
// ============================================================
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { authenticator } = require('otplib');
const db = require('../db');
const requireAdmin = require('../middleware/requireAdmin');
const { limiteAdminLogin } = require('../middleware/rateLimit');
const { normaliserTelephone } = require('../utils/helpers');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

function logAdmin(email, action, details, ip) {
  db.prepare(`INSERT INTO admin_logs (admin_email, action, details, ip) VALUES (?, ?, ?, ?)`)
    .run(email, action, details || '', ip);
}

// ---------- Connexion admin ----------
router.post('/connexion', limiteAdminLogin, async (req, res) => {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const { email, motDePasse, codeTotp } = req.body || {};
  const admin = db.prepare(`SELECT * FROM admins WHERE email = ? AND actif = 1`).get((email || '').toLowerCase().trim());

  // Réponse volontairement générique en cas d'échec (email ou mot de passe)
  const erreurGenerique = { erreur: "Identifiants incorrects." };

  if (!admin) return res.status(401).json(erreurGenerique);
  const motDePasseValide = await bcrypt.compare(motDePasse || '', admin.mot_de_passe_hash);
  if (!motDePasseValide) {
    logAdmin(admin.email, 'echec_connexion_mdp', '', ip);
    return res.status(401).json(erreurGenerique);
  }

  if (admin.totp_actif) {
    if (!codeTotp) {
      return res.status(200).json({ totpRequis: true });
    }
    const totpValide = authenticator.check(codeTotp, admin.totp_secret);
    if (!totpValide) {
      logAdmin(admin.email, 'echec_connexion_totp', '', ip);
      return res.status(401).json({ erreur: "Code d'authentification incorrect." });
    }
  }

  db.prepare(`UPDATE admins SET derniere_connexion = datetime('now') WHERE id = ?`).run(admin.id);
  logAdmin(admin.email, 'connexion_reussie', '', ip);

  const token = jwt.sign(
    { adminId: admin.id, email: admin.email, role: admin.role, nom: admin.nom },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );
  res.cookie('session_admin', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 8 * 3600 * 1000,
  });
  res.json({ message: 'Connexion réussie.', role: admin.role, nom: admin.nom });
});

router.post('/deconnexion', (req, res) => {
  res.clearCookie('session_admin');
  res.json({ message: 'Déconnecté.' });
});

router.get('/moi', requireAdmin('editeur'), (req, res) => {
  res.json({ email: req.admin.email, role: req.admin.role, nom: req.admin.nom });
});

// Activation du 2FA (TOTP) pour le compte connecté
router.post('/2fa/initier', requireAdmin('editeur'), (req, res) => {
  const secret = authenticator.generateSecret();
  db.prepare(`UPDATE admins SET totp_secret = ?, totp_actif = 0 WHERE id = ?`).run(secret, req.admin.adminId);
  const otpauth = authenticator.keyuri(req.admin.email, 'FGBMFI Paris - Admin', secret);
  res.json({ secret, otpauth });
});
router.post('/2fa/confirmer', requireAdmin('editeur'), (req, res) => {
  const admin = db.prepare(`SELECT totp_secret FROM admins WHERE id = ?`).get(req.admin.adminId);
  const valide = admin?.totp_secret && authenticator.check(req.body?.codeTotp || '', admin.totp_secret);
  if (!valide) return res.status(400).json({ erreur: "Code incorrect." });
  db.prepare(`UPDATE admins SET totp_actif = 1 WHERE id = ?`).run(req.admin.adminId);
  res.json({ message: "Authentification à deux facteurs activée." });
});

// ---------- Gestion des membres ----------
router.get('/membres', requireAdmin('gestionnaire_membres'), (req, res) => {
  const membres = db.prepare(`SELECT id, prenom, nom, telephone, statut, actif, date_ajout, date_derniere_connexion, date_expiration_acces FROM membres ORDER BY nom, prenom`).all();
  res.json(membres);
});

router.post('/membres', requireAdmin('gestionnaire_membres'), (req, res) => {
  const { prenom, nom, telephone, statut, consentementRgpd } = req.body || {};
  const tel = normaliserTelephone(telephone);
  if (!prenom || !nom || !tel) return res.status(400).json({ erreur: "Prénom, nom et numéro de téléphone valide sont requis." });
  try {
    const info = db.prepare(
      `INSERT INTO membres (prenom, nom, telephone, statut, consentement_rgpd) VALUES (?, ?, ?, ?, ?)`
    ).run(prenom.trim(), nom.trim(), tel, statut || 'membre', consentementRgpd ? 1 : 0);
    logAdmin(req.admin.email, 'ajout_membre', tel, req.ip);
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ erreur: "Ce numéro de téléphone est déjà enregistré." });
    res.status(500).json({ erreur: "Erreur lors de l'ajout du membre." });
  }
});

router.put('/membres/:id', requireAdmin('gestionnaire_membres'), (req, res) => {
  const { prenom, nom, telephone, statut, actif, dateExpirationAcces, notesAdmin } = req.body || {};
  const tel = telephone ? normaliserTelephone(telephone) : undefined;
  if (telephone && !tel) return res.status(400).json({ erreur: "Numéro de téléphone invalide." });

  const existant = db.prepare(`SELECT * FROM membres WHERE id = ?`).get(req.params.id);
  if (!existant) return res.status(404).json({ erreur: "Membre introuvable." });

  db.prepare(`
    UPDATE membres SET
      prenom = COALESCE(?, prenom),
      nom = COALESCE(?, nom),
      telephone = COALESCE(?, telephone),
      statut = COALESCE(?, statut),
      actif = COALESCE(?, actif),
      date_expiration_acces = ?,
      notes_admin = COALESCE(?, notes_admin)
    WHERE id = ?
  `).run(
    prenom ?? null, nom ?? null, tel ?? null, statut ?? null,
    actif === undefined ? null : (actif ? 1 : 0),
    dateExpirationAcces ?? existant.date_expiration_acces,
    notesAdmin ?? null,
    req.params.id
  );
  logAdmin(req.admin.email, 'modification_membre', `id=${req.params.id}`, req.ip);
  res.json({ message: 'Membre mis à jour.' });
});

// Suppression : archivage (actif=0) par défaut ; suppression définitive réservée au super_admin
router.delete('/membres/:id', requireAdmin('gestionnaire_membres'), (req, res) => {
  const definitif = req.query.definitif === 'true';
  if (definitif) {
    if (req.admin.role !== 'super_admin') {
      return res.status(403).json({ erreur: "Seul un super-administrateur peut supprimer définitivement un membre." });
    }
    db.prepare(`DELETE FROM membres WHERE id = ?`).run(req.params.id);
    logAdmin(req.admin.email, 'suppression_definitive_membre', `id=${req.params.id}`, req.ip);
    return res.json({ message: 'Membre supprimé définitivement.' });
  }
  db.prepare(`UPDATE membres SET actif = 0 WHERE id = ?`).run(req.params.id);
  logAdmin(req.admin.email, 'archivage_membre', `id=${req.params.id}`, req.ip);
  res.json({ message: 'Membre archivé (accès désactivé).' });
});

// Déblocage manuel après trop d'échecs de code
router.post('/membres/:id/debloquer', requireAdmin('gestionnaire_membres'), (req, res) => {
  const membre = db.prepare(`SELECT telephone FROM membres WHERE id = ?`).get(req.params.id);
  if (!membre) return res.status(404).json({ erreur: "Membre introuvable." });
  db.prepare(`DELETE FROM blocages WHERE telephone = ?`).run(membre.telephone);
  logAdmin(req.admin.email, 'deblocage_membre', membre.telephone, req.ip);
  res.json({ message: 'Blocage levé.' });
});

// Import CSV (colonnes attendues : prenom,nom,telephone,statut)
router.post('/membres/import-csv', requireAdmin('gestionnaire_membres'), upload.single('fichier'), (req, res) => {
  if (!req.file) return res.status(400).json({ erreur: "Aucun fichier reçu." });
  let lignes;
  try {
    lignes = parse(req.file.buffer.toString('utf-8'), { columns: true, skip_empty_lines: true, trim: true });
  } catch (e) {
    return res.status(400).json({ erreur: "Fichier CSV illisible : " + e.message });
  }

  const insert = db.prepare(`INSERT OR IGNORE INTO membres (prenom, nom, telephone, statut) VALUES (?, ?, ?, ?)`);
  let ajoutes = 0, ignores = 0, erreurs = [];
  const transaction = db.transaction((rows) => {
    for (const [i, ligne] of rows.entries()) {
      const tel = normaliserTelephone(ligne.telephone);
      if (!ligne.prenom || !ligne.nom || !tel) {
        erreurs.push(`Ligne ${i + 2} : données invalides ou téléphone incorrect.`);
        continue;
      }
      const info = insert.run(ligne.prenom.trim(), ligne.nom.trim(), tel, ligne.statut?.trim() || 'membre');
      if (info.changes > 0) ajoutes++; else ignores++;
    }
  });
  transaction(lignes);

  logAdmin(req.admin.email, 'import_csv_membres', `${ajoutes} ajoutés / ${ignores} doublons ignorés`, req.ip);
  res.json({ ajoutes, ignores, erreurs });
});

// ---------- Paramètres éditables (liens, textes Hero, objet de l'association) ----------
router.get('/parametres', requireAdmin('editeur'), (req, res) => {
  const rows = db.prepare(`SELECT * FROM parametres`).all();
  res.json(rows);
});
router.put('/parametres/:cle', requireAdmin('editeur'), (req, res) => {
  const { valeur } = req.body || {};
  db.prepare(`UPDATE parametres SET valeur = ?, modifie_le = datetime('now'), modifie_par = ? WHERE cle = ?`)
    .run(valeur ?? '', req.admin.email, req.params.cle);
  logAdmin(req.admin.email, 'modification_parametre', req.params.cle, req.ip);
  res.json({ message: 'Paramètre mis à jour.' });
});

// ---------- Remplacement du document des statuts ----------
router.post('/statuts', requireAdmin('super_admin'), upload.single('fichier'), (req, res) => {
  if (!req.file) return res.status(400).json({ erreur: "Aucun fichier reçu." });
  if (req.file.mimetype !== 'application/pdf') return res.status(400).json({ erreur: "Le fichier doit être un PDF." });
  const dest = path.join(__dirname, '..', '..', 'uploads', 'statuts.pdf');
  fs.writeFileSync(dest, req.file.buffer);
  logAdmin(req.admin.email, 'remplacement_statuts_pdf', `${(req.file.size / 1024).toFixed(0)} Ko`, req.ip);
  res.json({ message: 'Document des statuts mis à jour.' });
});

// ---------- Journaux ----------
router.get('/logs/connexions', requireAdmin('gestionnaire_membres'), (req, res) => {
  const logs = db.prepare(`SELECT * FROM sessions_log ORDER BY id DESC LIMIT 200`).all();
  res.json(logs);
});

// Effacement du journal des connexions (réservé au super-administrateur).
// Ce journal (sessions_log) est distinct des admin_logs (actions administrateur),
// qui eux restent intacts pour garder une traçabilité de cette purge elle-même.
router.delete('/logs/connexions', requireAdmin('super_admin'), (req, res) => {
  const telephone = req.query.telephone ? normaliserTelephone(req.query.telephone) : null;
  let info;
  if (telephone) {
    info = db.prepare(`DELETE FROM sessions_log WHERE telephone = ?`).run(telephone);
    logAdmin(req.admin.email, 'purge_journal_connexions_membre', `${telephone} — ${info.changes} entrée(s)`, req.ip);
  } else {
    info = db.prepare(`DELETE FROM sessions_log`).run();
    logAdmin(req.admin.email, 'purge_journal_connexions_complet', `${info.changes} entrée(s)`, req.ip);
  }
  res.json({ message: `${info.changes} entrée(s) de journal supprimée(s).`, supprimees: info.changes });
});
router.get('/logs/admin', requireAdmin('super_admin'), (req, res) => {
  const logs = db.prepare(`SELECT * FROM admin_logs ORDER BY id DESC LIMIT 200`).all();
  res.json(logs);
});

// ---------- Comptes administrateurs (super_admin uniquement) ----------
router.get('/admins', requireAdmin('super_admin'), (req, res) => {
  const admins = db.prepare(`SELECT id, email, nom, role, totp_actif, actif, derniere_connexion FROM admins`).all();
  res.json(admins);
});
router.post('/admins', requireAdmin('super_admin'), async (req, res) => {
  const { email, nom, motDePasse, role } = req.body || {};
  if (!email || !motDePasse || motDePasse.length < 12) {
    return res.status(400).json({ erreur: "Email requis et mot de passe d'au moins 12 caractères." });
  }
  const hash = await bcrypt.hash(motDePasse, 12);
  try {
    db.prepare(`INSERT INTO admins (email, nom, mot_de_passe_hash, role) VALUES (?, ?, ?, ?)`)
      .run(email.toLowerCase().trim(), nom || '', hash, role || 'editeur');
    logAdmin(req.admin.email, 'creation_compte_admin', email, req.ip);
    res.status(201).json({ message: 'Compte administrateur créé.' });
  } catch (e) {
    res.status(409).json({ erreur: "Un compte existe déjà avec cet email." });
  }
});
router.put('/admins/:id', requireAdmin('super_admin'), (req, res) => {
  const { role, actif } = req.body || {};
  db.prepare(`UPDATE admins SET role = COALESCE(?, role), actif = COALESCE(?, actif) WHERE id = ?`)
    .run(role ?? null, actif === undefined ? null : (actif ? 1 : 0), req.params.id);
  logAdmin(req.admin.email, 'modification_compte_admin', `id=${req.params.id}`, req.ip);
  res.json({ message: 'Compte mis à jour.' });
});

// ---------- Codes de test (mode SMS mock uniquement) ----------
router.get('/otp-test', requireAdmin('super_admin'), (req, res) => {
  if ((process.env.SMS_PROVIDER || 'mock') !== 'mock') {
    return res.status(403).json({ erreur: "Disponible uniquement en mode SMS_PROVIDER=mock." });
  }
  const recents = db.prepare(`SELECT telephone, cree_le, expire_le, utilise FROM otp_codes ORDER BY id DESC LIMIT 20`).all();
  res.json({ info: "Les codes ne sont pas stockés en clair ; consultez les logs serveur (console) pour voir la valeur réelle envoyée en mode mock.", recents });
});

module.exports = router;
