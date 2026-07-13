// ============================================================
// app.js — Connexion (téléphone + OTP) et affichage de l'espace membre
// ============================================================
(function () {
  const $ = (id) => document.getElementById(id);
  let telephoneEnCours = '';

  function afficherMessage(zoneId, texte, type = 'erreur') {
    const zone = $(zoneId);
    zone.innerHTML = `<div class="message message--${type}">${texte}</div>`;
  }
  function viderMessage(zoneId) { $(zoneId).innerHTML = ''; }

  function afficherVue(id) {
    ['vue-connexion', 'vue-otp', 'vue-membre'].forEach(v => $(v).classList.add('cache'));
    $(id).classList.remove('cache');
  }

  // ---------- Étape 1 : demande de code ----------
  $('form-telephone').addEventListener('submit', async (e) => {
    e.preventDefault();
    viderMessage('zone-message-connexion');
    const telephone = $('telephone').value.trim();
    const btn = $('btn-demander-code');
    btn.disabled = true; btn.textContent = 'Envoi en cours…';

    try {
      const r = await fetch('/api/auth/demander-code', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify({ telephone }),
      });
      const data = await r.json();
      if (!r.ok) { afficherMessage('zone-message-connexion', data.erreur || 'Une erreur est survenue.'); return; }

      telephoneEnCours = telephone;
      $('otp-soustitre').textContent = `Un code à 6 chiffres a été envoyé au ${telephone}.`;
      afficherVue('vue-otp');
      document.querySelectorAll('#otp-cases input')[0]?.focus();

      if (data.modeTest) {
        afficherMessage('zone-message-otp', `Mode test (aucun SMS réel) — code : <strong>${data.codeDeTest}</strong>`, 'test');
      }
    } catch (e2) {
      afficherMessage('zone-message-connexion', "Impossible de contacter le serveur. Vérifiez votre connexion.");
    } finally {
      btn.disabled = false; btn.textContent = 'Recevoir mon code';
    }
  });

  // ---------- Saisie OTP : avancement automatique entre les 6 cases ----------
  const casesOtp = () => Array.from(document.querySelectorAll('#otp-cases input'));
  document.addEventListener('input', (e) => {
    if (!e.target.matches('#otp-cases input')) return;
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 1);
    const cases = casesOtp();
    const idx = cases.indexOf(e.target);
    if (e.target.value && idx < cases.length - 1) cases[idx + 1].focus();
  });
  document.addEventListener('keydown', (e) => {
    if (!e.target.matches('#otp-cases input')) return;
    const cases = casesOtp();
    const idx = cases.indexOf(e.target);
    if (e.key === 'Backspace' && !e.target.value && idx > 0) cases[idx - 1].focus();
  });
  document.addEventListener('paste', (e) => {
    if (!e.target.matches('#otp-cases input')) return;
    const texte = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
    if (texte.length === 6) {
      e.preventDefault();
      casesOtp().forEach((input, i) => { input.value = texte[i] || ''; });
      casesOtp()[5].focus();
    }
  });

  // ---------- Étape 2 : vérification du code ----------
  $('form-otp').addEventListener('submit', async (e) => {
    e.preventDefault();
    viderMessage('zone-message-otp');
    const code = casesOtp().map(i => i.value).join('');
    if (code.length !== 6) { afficherMessage('zone-message-otp', 'Merci de saisir les 6 chiffres du code.'); return; }

    const btn = $('btn-verifier-code');
    btn.disabled = true; btn.textContent = 'Vérification…';
    try {
      const r = await fetch('/api/auth/verifier-code', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify({ telephone: telephoneEnCours, code }),
      });
      const data = await r.json();
      if (!r.ok) {
        afficherMessage('zone-message-otp', data.erreur || 'Code incorrect.');
        casesOtp().forEach(i => i.value = '');
        casesOtp()[0].focus();
        return;
      }
      await chargerEspaceMembre();
    } catch (e2) {
      afficherMessage('zone-message-otp', "Impossible de contacter le serveur.");
    } finally {
      btn.disabled = false; btn.textContent = 'Vérifier le code';
    }
  });

  $('btn-renvoyer-code').addEventListener('click', () => {
    $('form-telephone').requestSubmit();
  });
  $('btn-changer-numero').addEventListener('click', () => {
    afficherVue('vue-connexion');
    viderMessage('zone-message-otp');
  });

  // ---------- Espace membre ----------
  async function chargerEspaceMembre() {
    const [rMoi, rParams] = await Promise.all([
      fetch('/api/membre/moi', { credentials: 'include' }),
      fetch('/api/membre/parametres', { credentials: 'include' }),
    ]);
    if (!rMoi.ok) { afficherVue('vue-connexion'); return; }
    const moi = await rMoi.json();
    const params = await rParams.json();

    $('prenom-membre').textContent = moi.prenom || 'membre';
    if (params.hero_titre) $('hero-titre').textContent = params.hero_titre;
    if (params.hero_sous_titre) $('hero-soustitre').textContent = params.hero_sous_titre;

    const actions = [
      { titre: 'Rejoindre l’équipe', texte: 'Donnez du temps, partagez vos compétences et prenez part au développement de FGBMFI Paris.', lien: params.lien_besoins_equipe, bouton: 'Découvrir les besoins' },
      { titre: 'Participer à la gouvernance', texte: 'Bureau, commissions, pôles thématiques : chacun peut trouver une place adaptée à son expérience.', lien: params.lien_gouvernance, bouton: 'Proposer ma participation' },
      { titre: 'Découvrir les pôles', texte: 'Business, Ladies, Formation, Humanitaire, Business Prayer… explorez les différents pôles de l’association.', lien: params.lien_poles, bouton: 'Voir les pôles' },
      { titre: 'Découvrir FGBMFI Paris', texte: 'Retrouvez la présentation vidéo de l’association, ses actions et ses valeurs.', lien: params.lien_presentation, bouton: 'Voir la présentation' },
      { titre: 'Site officiel', texte: 'Accédez au site officiel de FGBMFI Paris pour toutes les informations complémentaires.', lien: params.lien_site_officiel, bouton: 'Visiter le site' },
    ];
    $('grille-actions').innerHTML = actions.map(a => `
      <a class="action-carte" href="${a.lien || '#'}" target="${a.lien ? '_blank' : '_self'}" rel="noopener">
        <h3>${a.titre}</h3>
        <p>${a.texte}</p>
        <span class="fleche">${a.bouton} →</span>
      </a>
    `).join('');

    afficherVue('vue-membre');
  }

  $('btn-consulter-statuts').addEventListener('click', () => window.LecteurStatuts.ouvrir());
  $('btn-fermer-lecteur').addEventListener('click', () => window.LecteurStatuts.fermer());
  $('btn-page-precedente').addEventListener('click', () => window.LecteurStatuts.pagePrecedente());
  $('btn-page-suivante').addEventListener('click', () => window.LecteurStatuts.pageSuivante());
  $('btn-zoom-moins').addEventListener('click', () => window.LecteurStatuts.zoom(-0.2));
  $('btn-zoom-plus').addEventListener('click', () => window.LecteurStatuts.zoom(0.2));

  $('btn-deconnexion').addEventListener('click', async () => {
    await fetch('/api/auth/deconnexion', { method: 'POST', credentials: 'include' });
    window.location.reload();
  });

  // Au chargement : tenter de restaurer la session (cookie httpOnly déjà présent)
  (async function initial() {
    try {
      const r = await fetch('/api/membre/moi', { credentials: 'include' });
      if (r.ok) { await chargerEspaceMembre(); }
    } catch (e) { /* pas de session active, on reste sur l'écran de connexion */ }
  })();
})();
