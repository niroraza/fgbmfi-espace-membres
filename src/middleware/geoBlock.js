// ============================================================
// geoBlock.js — Blocage optionnel de pays via géolocalisation IP.
//
// IMPORTANT (à garder en tête, cf brief §12) :
//   Le géoblocage n'est JAMAIS une protection suffisante à elle seule
//   (VPN, proxys, IP mal géolocalisées, membres en déplacement...).
//   Il s'agit d'une couche supplémentaire, pas d'un rempart absolu.
//
// Implémentation : appel à un service de géolocalisation IP gratuit
// (ip-api.com, sans clé, usage raisonnable). Pour un usage à plus fort
// trafic, remplacer par un service payant plus fiable (MaxMind, IPinfo...)
// et/ou par une liste gérée au niveau du CDN/pare-feu (Cloudflare, etc.),
// ce qui est plus robuste qu'un contrôle applicatif.
//
// Désactivé par défaut si PAYS_BLOQUES est vide dans .env.
// ============================================================

const CACHE_TTL_MS = 60 * 60 * 1000; // 1h
const cache = new Map(); // ip -> { pays, expire }

async function geoBlock(req, res, next) {
  const paysBloquesRaw = (process.env.PAYS_BLOQUES || '').trim();
  if (!paysBloquesRaw) return next(); // fonctionnalité désactivée

  const paysBloques = paysBloquesRaw.split(',').map(p => p.trim().toUpperCase()).filter(Boolean);
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

  // Adresses locales/privées : on laisse passer (dev, health checks internes)
  if (!ip || ip === '::1' || ip.startsWith('127.') || ip.startsWith('10.') || ip.startsWith('192.168.')) {
    return next();
  }

  try {
    const cached = cache.get(ip);
    let pays;
    if (cached && cached.expire > Date.now()) {
      pays = cached.pays;
    } else {
      const resp = await fetch(`http://ip-api.com/json/${ip}?fields=countryCode`, { signal: AbortSignal.timeout(2500) });
      const data = await resp.json();
      pays = data.countryCode || null;
      cache.set(ip, { pays, expire: Date.now() + CACHE_TTL_MS });
    }

    if (pays && paysBloques.includes(pays)) {
      return res.status(403).json({
        erreur: "Accès non disponible depuis votre localisation actuelle. Si vous êtes membre et en déplacement, contactez l'administration de FGBMFI Paris.",
      });
    }
  } catch (e) {
    // En cas d'échec du service de géolocalisation, on n'empêche pas la connexion :
    // le géoblocage est une couche additionnelle, pas la protection principale.
    console.warn('[geoBlock] service indisponible, requête autorisée par défaut:', e.message);
  }

  next();
}

module.exports = geoBlock;
