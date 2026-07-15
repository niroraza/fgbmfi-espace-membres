require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');

const { limiteGenerale } = require('./src/middleware/rateLimit');
const geoBlock = require('./src/middleware/geoBlock');
const authRoutes = require('./src/routes/auth');
const memberRoutes = require('./src/routes/member');
const adminRoutes = require('./src/routes/admin');

const app = express();
app.set('trust proxy', 1); // nécessaire derrière Render/Railway/Netlify pour obtenir la vraie IP

// --- Sécurité HTTP de base ---
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      workerSrc: ["'self'", "blob:", "https://cdnjs.cloudflare.com"],
      childSrc: ["'self'", "blob:"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      frameAncestors: ["'self'"],
      objectSrc: ["'none'"],
    },
  },
}));
app.use(cors({ origin: process.env.APP_URL, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(limiteGenerale);
app.use(geoBlock);

// --- API ---
app.use('/api/auth', authRoutes);
app.use('/api/membre', memberRoutes);
app.use('/api/admin', adminRoutes);

app.get('/api/sante', (req, res) => res.json({ statut: 'ok' }));

// --- Fichiers statiques (frontend membre + admin) ---
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/confidentialite', (req, res) => res.sendFile(path.join(__dirname, 'public', 'confidentialite.html')));

// Toute autre route inconnue -> page d'accueil (SPA simple)
app.use((req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ erreur: 'Route inconnue.' });
  res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Gestion d'erreur générique (ne jamais exposer la pile d'erreur au client)
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ erreur: "Une erreur interne est survenue." });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`FGBMFI Paris — Espace membres démarré sur le port ${PORT}`);
  console.log(`Mode SMS : ${process.env.SMS_PROVIDER || 'mock'}`);
});
