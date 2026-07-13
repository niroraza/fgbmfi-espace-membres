// ============================================================
// routes/member.js — Contenu de l'espace membre après connexion
// ============================================================
const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');
const { creerTokenPdf, verifierTokenPdf, masquerTelephone } = require('../utils/helpers');

const router = express.Router();
const STATUTS_PATH = path.join(__dirname, '..', '..', 'uploads', 'statuts.pdf');

// Infos du membre connecté (pour affichage Hero)
router.get('/moi', requireAuth, (req, res) => {
  const membre = db.prepare(`SELECT prenom, nom, telephone, statut FROM membres WHERE id = ?`).get(req.membre.membreId);
  if (!membre) return res.status(404).json({ erreur: "Membre introuvable." });
  res.json({
    prenom: membre.prenom,
    nom: membre.nom,
    telephoneMasque: masquerTelephone(membre.telephone),
    statut: membre.statut,
  });
});

// Paramètres/textes/liens éditables (visibles uniquement une fois connecté)
router.get('/parametres', requireAuth, (req, res) => {
  const rows = db.prepare(`SELECT cle, valeur FROM parametres`).all();
  const params = {};
  rows.forEach(r => { params[r.cle] = r.valeur; });
  res.json(params);
});

// Étape 1 : le membre connecté demande un jeton temporaire pour ouvrir le PDF
router.get('/statuts/jeton', requireAuth, (req, res) => {
  if (!fs.existsSync(STATUTS_PATH)) {
    return res.status(404).json({ erreur: "Le document des statuts n'est pas encore disponible. Contactez l'administration." });
  }
  const token = creerTokenPdf({ membreId: req.membre.membreId, telephone: req.membre.telephone });
  res.json({ token, expireDansSecondes: parseInt(process.env.PDF_TOKEN_TTL_SECONDS || '90', 10) });
});

// Étape 2 : diffusion du PDF via le jeton signé et de courte durée
// (Pas de bouton téléchargement dans l'UI, pas d'URL publique permanente ;
//  le fichier est en plus rendu page par page côté client avec filigrane —
//  voir public/js/pdfViewer.js. Rappel réaliste : ceci décourage fortement
//  la copie, sans pouvoir la rendre techniquement impossible.)
router.get('/statuts/document', (req, res) => {
  const token = req.query.t;
  if (!token) return res.status(401).json({ erreur: "Accès refusé." });

  let payload;
  try {
    payload = verifierTokenPdf(token);
  } catch (e) {
    return res.status(401).json({ erreur: "Lien expiré. Merci de recharger la page pour obtenir un nouveau lien." });
  }

  if (!fs.existsSync(STATUTS_PATH)) {
    return res.status(404).json({ erreur: "Document indisponible." });
  }

  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': 'inline', // sans nom de fichier, pour ne pas encourager l'enregistrement
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'Pragma': 'no-cache',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
    'X-Frame-Options': 'SAMEORIGIN',
    'X-Content-Type-Options': 'nosniff',
  });
  fs.createReadStream(STATUTS_PATH).pipe(res);
});

module.exports = router;
