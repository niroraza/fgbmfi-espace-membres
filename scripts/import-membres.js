// Usage : node scripts/import-membres.js chemin/vers/membres.csv
// Colonnes attendues dans le CSV : prenom,nom,telephone,statut
require('dotenv').config();
const fs = require('fs');
const { parse } = require('csv-parse/sync');
const db = require('../src/db');
const { normaliserTelephone } = require('../src/utils/helpers');

const cheminFichier = process.argv[2];
if (!cheminFichier) {
  console.log('Usage : node scripts/import-membres.js chemin/vers/membres.csv');
  process.exit(1);
}

const contenu = fs.readFileSync(cheminFichier, 'utf-8');
const lignes = parse(contenu, { columns: true, skip_empty_lines: true, trim: true });

const insert = db.prepare(`INSERT OR IGNORE INTO membres (prenom, nom, telephone, statut) VALUES (?, ?, ?, ?)`);
let ajoutes = 0, ignores = 0;
for (const [i, ligne] of lignes.entries()) {
  const tel = normaliserTelephone(ligne.telephone);
  if (!ligne.prenom || !ligne.nom || !tel) {
    console.warn(`Ligne ${i + 2} ignorée (données invalides) :`, ligne);
    continue;
  }
  const info = insert.run(ligne.prenom.trim(), ligne.nom.trim(), tel, ligne.statut?.trim() || 'membre');
  if (info.changes > 0) ajoutes++; else ignores++;
}
console.log(`Import terminé : ${ajoutes} membre(s) ajouté(s), ${ignores} doublon(s) ignoré(s).`);
