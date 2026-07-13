// ============================================================
// db.js — Connexion SQLite + schéma de la base
// Toutes les données restent dans un seul fichier : data/fgbmfi.db
// (à sauvegarder régulièrement, cf README-DEPLOIEMENT.md)
// ============================================================
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'fgbmfi.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS membres (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prenom TEXT NOT NULL,
  nom TEXT NOT NULL,
  telephone TEXT NOT NULL UNIQUE,        -- format E.164, ex: +33600000000
  statut TEXT DEFAULT 'membre',          -- membre, bureau, honoraire...
  actif INTEGER DEFAULT 1,               -- 1 = accès autorisé, 0 = suspendu
  date_ajout TEXT DEFAULT (datetime('now')),
  date_derniere_connexion TEXT,
  date_expiration_acces TEXT,            -- optionnel, NULL = illimité
  consentement_rgpd INTEGER DEFAULT 0,
  notes_admin TEXT
);

CREATE TABLE IF NOT EXISTS otp_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telephone TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  cree_le TEXT DEFAULT (datetime('now')),
  expire_le TEXT NOT NULL,
  utilise INTEGER DEFAULT 0,
  tentatives_echouees INTEGER DEFAULT 0
);

-- Compteur d'envois OTP par numéro (pour la limite de 3/jour + délai mini)
CREATE TABLE IF NOT EXISTS otp_envois (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telephone TEXT NOT NULL,
  envoye_le TEXT DEFAULT (datetime('now')),
  ip TEXT
);

-- Blocages temporaires après trop d'échecs
CREATE TABLE IF NOT EXISTS blocages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telephone TEXT NOT NULL,
  bloque_jusqua TEXT NOT NULL,
  raison TEXT,
  cree_le TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telephone TEXT,
  ip TEXT,
  user_agent TEXT,
  action TEXT,                            -- connexion_reussie, echec_code, deconnexion...
  cree_le TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  nom TEXT,
  mot_de_passe_hash TEXT NOT NULL,
  role TEXT DEFAULT 'editeur',            -- super_admin, gestionnaire_membres, editeur
  totp_secret TEXT,                       -- 2FA (otplib), NULL tant que non activé
  totp_actif INTEGER DEFAULT 0,
  actif INTEGER DEFAULT 1,
  cree_le TEXT DEFAULT (datetime('now')),
  derniere_connexion TEXT
);

CREATE TABLE IF NOT EXISTS admin_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_email TEXT,
  action TEXT,
  details TEXT,
  ip TEXT,
  cree_le TEXT DEFAULT (datetime('now'))
);

-- Paramètres éditables sans redéploiement (liens, textes du Hero, etc.)
CREATE TABLE IF NOT EXISTS parametres (
  cle TEXT PRIMARY KEY,
  valeur TEXT,
  modifie_le TEXT DEFAULT (datetime('now')),
  modifie_par TEXT
);

CREATE TABLE IF NOT EXISTS ip_bloquees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL UNIQUE,
  raison TEXT,
  cree_le TEXT DEFAULT (datetime('now'))
);
`);

// Valeurs par défaut des paramètres éditables (insérées seulement si absentes)
const defaultParams = {
  hero_titre: 'Bienvenue dans l’espace des membres de FGBMFI Paris',
  hero_sous_titre: 'Retrouvez les statuts officiels de l’association, découvrez son organisation et participez à sa dynamique.',
  objet_association: "FGBMFI Paris a pour objet principal d’animer un réseau professionnel, solidaire et engagé, rassemblant des entrepreneurs, professionnels, dirigeants et toute personne engagée dans la vie économique et sociale, afin de favoriser le témoignage, l’entraide, le réseautage, la formation, le développement des talents et des actions à impact.",
  lien_site_officiel: process.env.SITE_OFFICIEL_URL || 'https://fgbmfi-paris.org',
  lien_presentation: process.env.PRESENTATION_URL || 'https://fgbmfi-paris.netlify.app',
  lien_besoins_equipe: '',
  lien_gouvernance: '',
  lien_poles: '',
  rna: 'W751258889',
};
const insertParam = db.prepare(`INSERT OR IGNORE INTO parametres (cle, valeur) VALUES (?, ?)`);
for (const [cle, valeur] of Object.entries(defaultParams)) {
  insertParam.run(cle, valeur);
}

module.exports = db;
