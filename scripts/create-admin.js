// Usage : node scripts/create-admin.js "email@fgbmfi-paris.org" "MotDePasseTresRobuste123!" "Prénom Nom"
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../src/db');

async function main() {
  const [email, motDePasse, nom] = process.argv.slice(2);
  if (!email || !motDePasse) {
    console.log('Usage : node scripts/create-admin.js "email@exemple.org" "MotDePasse" "Nom (optionnel)"');
    process.exit(1);
  }
  if (motDePasse.length < 12) {
    console.log('Le mot de passe doit contenir au moins 12 caractères.');
    process.exit(1);
  }
  const hash = await bcrypt.hash(motDePasse, 12);
  try {
    db.prepare(`INSERT INTO admins (email, nom, mot_de_passe_hash, role) VALUES (?, ?, ?, 'super_admin')`)
      .run(email.toLowerCase().trim(), nom || '', hash);
    console.log(`Compte super-administrateur créé : ${email}`);
    console.log('Pensez à activer la double authentification (2FA) dès la première connexion.');
  } catch (e) {
    console.error('Erreur : ce compte existe peut-être déjà.', e.message);
  }
}
main();
