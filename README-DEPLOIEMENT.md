# Guide de mise en ligne — Espace des membres FGBMFI Paris

Ce document explique comment déployer, configurer et exploiter l'application au quotidien.
Il est écrit pour quelqu'un qui n'a jamais déployé d'application Node.js.

---

## 1. Ce que contient le dossier

```
fgbmfi-espace-membres/
  server.js              → point d'entrée du serveur
  src/                    → logique métier (routes, sécurité, base de données)
  public/                 → tout ce qui est affiché dans le navigateur
  scripts/                → outils en ligne de commande (créer un admin, importer des membres)
  uploads/statuts.pdf     → le document des statuts (déjà en place : version 37 pages
                             fournie, statuts + règlement intérieur + annexes)
  .env.example            → modèle de configuration à copier en ".env"
```

## 2. Pourquoi Render (et pas Netlify) pour cette application

Votre PWA de présentation (fgbmfi-paris.netlify.app) est un simple site statique : Netlify est parfait pour ça.

Cette application-ci a besoin en permanence :
- d'une base de données qui garde en mémoire les membres, les codes envoyés, les blocages ;
- d'un serveur qui tourne en continu pour gérer les sessions et les limites de débit.

Netlify seul ne sait pas faire ça facilement (ses "fonctions" redémarrent à chaque appel et oublient tout).
**Render.com** (gratuit pour commencer) fait tourner un vrai serveur Node.js en continu, avec un disque
qui garde la base de données entre deux redémarrages. C'est la solution la plus simple pour ce projet.
(Railway.app fonctionne de façon très similaire si vous préférez.)

## 3. Déploiement sur Render — étape par étape

1. Créez un compte gratuit sur [render.com](https://render.com).
2. Mettez ce dossier dans un dépôt GitHub privé (créez un dépôt, poussez les fichiers — le fichier
   `.gitignore` fourni exclut automatiquement les secrets et la base de données).
3. Sur Render : **New +** → **Web Service** → connectez votre dépôt GitHub.
4. Renseignez :
   - **Build Command** : `npm install`
   - **Start Command** : `npm start`
   - **Instance Type** : Free (suffisant pour démarrer)
5. Ajoutez un **disque persistant** (Render → onglet "Disks") monté sur `/opt/render/project/src/data`
   et `/opt/render/project/src/uploads` — cela garantit que la base de données et le PDF survivent
   aux redéploiements. (Sur le plan gratuit, un disque de 1 Go suffit largement.)
6. Dans l'onglet **Environment**, copiez toutes les variables de `.env.example` et remplissez-les :
   - `JWT_SECRET` et `PDF_TOKEN_SECRET` : générez deux chaînes aléatoires différentes, par exemple
     avec la commande `openssl rand -hex 32` sur votre ordinateur, ou via un générateur en ligne fiable.
   - `APP_URL` : l'adresse Render finale (ex. `https://fgbmfi-membres.onrender.com`).
   - `SMS_PROVIDER=mock` pour commencer (aucun SMS réel, le code s'affiche dans les logs Render et
     dans la réponse de test) — passez à `twilio` dès que vous aurez un compte (voir §4).
7. Cliquez sur **Create Web Service**. Le premier déploiement prend 2 à 5 minutes.

## 4. Activer les vrais SMS avec Twilio

1. Créez un compte sur [twilio.com](https://www.twilio.com) (un essai gratuit avec crédit est proposé).
2. Achetez un numéro d'expéditeur (quelques euros/mois) capable d'envoyer des SMS vers la France.
3. Récupérez dans la console Twilio : **Account SID**, **Auth Token**, et le numéro acheté.
4. Sur Render, dans les variables d'environnement, renseignez `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
   `TWILIO_FROM_NUMBER`, puis passez `SMS_PROVIDER` à `twilio`. Redéployez.

Tant que `SMS_PROVIDER=mock`, aucun SMS n'est envoyé et le code s'affiche directement à l'écran de
connexion (mention "Mode test") — pratique pour valider tout le parcours avant de payer un service SMS.

## 5. Première mise en route (une fois déployé)

Ouvrez un terminal Render (**Shell**, dans le tableau de bord du service) et lancez :

```bash
# Créer le premier compte super-administrateur
npm run init-admin -- "votre-email@fgbmfi-paris.org" "UnMotDePasseTresRobuste123!" "Votre nom"

# Importer une première liste de membres (préparez un CSV avec les colonnes
# prenom,nom,telephone,statut — un modèle est fourni dans scripts/modele-membres.csv)
npm run import-membres -- data/mes-membres.csv
```

Vous pouvez aussi ajouter des membres un par un, ou importer un CSV, directement depuis
l'interface d'administration (`/admin`) une fois connecté.

**Important** : dès votre première connexion à `/admin`, allez dans l'onglet "Ma sécurité" et
activez la double authentification (2FA). C'est fortement recommandé pour tout compte administrateur,
et indispensable pour le super-administrateur.

## 6. Le document des statuts

Le fichier fourni (`uploads/statuts.pdf`, 37 pages : statuts + règlement intérieur + annexes) est déjà
en place. Pour le remplacer plus tard, utilisez l'onglet "Document des statuts" de l'administration
(réservé au super-administrateur) — aucune intervention technique n'est nécessaire.

## 7. Utilisation courante

- **Ajouter un membre** : Admin → onglet Membres → "Ajouter un membre", ou importer un CSV.
- **Suspendre un membre** (sans le supprimer) : bouton "Suspendre" dans la liste.
- **Débloquer un membre** après plusieurs codes incorrects : bouton "Débloquer".
- **Modifier les liens et textes** (site officiel, présentation, pôles...) : onglet "Contenu & liens".
- **Consulter qui s'est connecté** : onglet Journaux.
- **Créer un autre compte administrateur** : onglet "Comptes admin" (super-administrateur uniquement).

## 8. Sauvegarde

La base de données est le fichier `data/fgbmfi.db` sur le disque persistant Render. Pensez à en
télécharger une copie régulièrement (via le Shell Render : `cat data/fgbmfi.db | base64`, ou en
configurant une sauvegarde automatique du disque dans les réglages Render). En cas de disque perdu,
sans sauvegarde, la liste des membres et l'historique seraient à reconstituer.

## 9. Dépublier ou rediriger l'application

Le jour où le site officiel `fgbmfi-paris.org` est prêt :
- **Dépublier simplement** : dans Render, suspendez ou supprimez le service (Settings → Suspend/Delete).
- **Rediriger** : remplacez le contenu de `public/index.html` par une redirection immédiate vers le
  site officiel, ou configurez une règle de redirection au niveau du nom de domaine si vous en avez
  connecté un.

## 10. Limites connues à garder en tête

- Le géoblocage (pays interdits) est une couche complémentaire, pas une protection absolue : un
  utilisateur peut toujours passer par un VPN. Il est désactivé par défaut (variable `PAYS_BLOQUES`
  vide) ; activez-le seulement si vous en avez besoin, en connaissant cette limite.
- Le lecteur PDF décourage fortement la copie (pas de bouton télécharger, filigrane, jeton temporaire,
  rendu en image plutôt qu'en PDF natif) mais ne peut pas empêcher une capture d'écran — c'est une
  limite technique inhérente à tout affichage à l'écran, à laquelle aucune application ne peut échapper.
- Le plan gratuit de Render met le service en veille après une période d'inactivité ; le premier
  chargement après une pause peut prendre quelques secondes de plus. Un plan payant (7$/mois environ)
  supprime cette latence si cela devient gênant.

## 11. Vérifications avant d'annoncer l'application aux membres

- [ ] Connexion testée avec un vrai numéro de membre et un vrai SMS (mode `twilio`)
- [ ] Double authentification activée sur le compte super-administrateur
- [ ] Mot de passe admin robuste et unique (12 caractères minimum, jamais réutilisé ailleurs)
- [ ] Liste des membres importée et vérifiée
- [ ] Document des statuts vérifié (bonne version, toutes les pages s'affichent)
- [ ] Liens (site officiel, présentation, pôles) renseignés dans l'onglet "Contenu & liens"
- [ ] Test sur téléphone Android et iPhone
- [ ] Sauvegarde de la base de données programmée
