// ============================================================
// admin.js — Logique de l'interface d'administration
// ============================================================
(function () {
  const $ = (id) => document.getElementById(id);
  const api = async (url, options = {}) => {
    const r = await fetch(url, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...options });
    let data = {};
    try { data = await r.json(); } catch (e) {}
    if (!r.ok) throw new Error(data.erreur || 'Une erreur est survenue.');
    return data;
  };

  let monRole = null;

  // ---------- Connexion admin ----------
  $('form-admin-connexion').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('admin-email').value.trim();
    const motDePasse = $('admin-mdp').value;
    const codeTotp = $('admin-totp').value.trim();
    const zone = $('admin-message-connexion');
    zone.innerHTML = '';
    try {
      const data = await api('/api/admin/connexion', { method: 'POST', body: JSON.stringify({ email, motDePasse, codeTotp }) });
      if (data.totpRequis) {
        $('champ-totp').classList.remove('cache');
        zone.innerHTML = `<div class="message message--info">Merci de saisir votre code d'authentification à deux facteurs.</div>`;
        return;
      }
      monRole = data.role;
      await demarrerDashboard();
    } catch (err) {
      zone.innerHTML = `<div class="message message--erreur">${err.message}</div>`;
    }
  });

  $('btn-admin-deconnexion').addEventListener('click', async () => {
    await api('/api/admin/deconnexion', { method: 'POST' });
    window.location.reload();
  });

  // ---------- Navigation par onglets ----------
  document.querySelectorAll('.onglet').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.onglet').forEach(b => b.classList.remove('actif'));
      document.querySelectorAll('.panneau').forEach(p => p.classList.add('cache'));
      btn.classList.add('actif');
      $(`onglet-${btn.dataset.onglet}`).classList.remove('cache');
    });
  });

  async function demarrerDashboard() {
    $('admin-vue-connexion').classList.add('cache');
    $('admin-vue-dashboard').classList.remove('cache');
    const moi = await api('/api/admin/moi');
    monRole = moi.role;
    $('admin-role-affiche').textContent = `${moi.role} · ${moi.email}`;
    if (monRole !== 'super_admin') {
      document.querySelector('[data-onglet="comptes"]').classList.add('cache');
    }
    await Promise.all([chargerMembres(), chargerParametres(), chargerLogs(), chargerComptes(), initSecurite()]);
  }

  // ================= MEMBRES =================
  let membresEnCache = [];

  async function chargerMembres() {
    try { membresEnCache = await api('/api/admin/membres'); } catch (e) { return; }
    const tbody = document.querySelector('#table-membres tbody');
    tbody.innerHTML = membresEnCache.map(m => `
      <tr data-id="${m.id}">
        <td>${m.prenom} ${m.nom}</td>
        <td style="font-family:var(--font-mono)">${m.telephone}</td>
        <td>${m.statut}</td>
        <td>${m.actif ? '<span class="badge badge--ok">Actif</span>' : '<span class="badge badge--off">Suspendu</span>'}</td>
        <td>${m.date_derniere_connexion ? new Date(m.date_derniere_connexion + 'Z').toLocaleString('fr-FR') : '—'}</td>
        <td>
          <button class="bouton-mini bouton-mini--fantome" data-action="modifier">Modifier</button>
          <button class="bouton-mini bouton-mini--fantome" data-action="basculer">${m.actif ? 'Suspendre' : 'Réactiver'}</button>
          <button class="bouton-mini bouton-mini--fantome" data-action="debloquer">Débloquer</button>
          ${monRole === 'super_admin' ? '<button class="bouton-mini bouton-mini--danger" data-action="supprimer">Supprimer</button>' : ''}
        </td>
      </tr>
    `).join('') || '<tr><td colspan="6">Aucun membre enregistré pour le moment.</td></tr>';
  }

  document.querySelector('#table-membres tbody').addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const id = btn.closest('tr').dataset.id;
    try {
      if (btn.dataset.action === 'basculer') {
        const estActif = btn.textContent.trim() === 'Suspendre';
        await api(`/api/admin/membres/${id}`, { method: 'PUT', body: JSON.stringify({ actif: !estActif }) });
      } else if (btn.dataset.action === 'debloquer') {
        await api(`/api/admin/membres/${id}/debloquer`, { method: 'POST' });
      } else if (btn.dataset.action === 'modifier') {
        const membre = membresEnCache.find(m => String(m.id) === id);
        if (membre) ouvrirFormulaireMembre(membre);
        return;
      } else if (btn.dataset.action === 'supprimer') {
        const membre = membresEnCache.find(m => String(m.id) === id);
        const confirmation = confirm(
          `Supprimer définitivement ${membre.prenom} ${membre.nom} (${membre.telephone}) ?\n\n` +
          `Cette action est IRRÉVERSIBLE et efface aussi son historique de connexion.\n` +
          `Pour simplement lui retirer l'accès sans tout effacer, utilisez plutôt "Suspendre".`
        );
        if (!confirmation) return;
        await api(`/api/admin/membres/${id}?definitif=true`, { method: 'DELETE' });
      }
      await chargerMembres();
    } catch (err) { alert(err.message); }
  });

  function ouvrirFormulaireMembre(membreExistant) {
    const zone = $('formulaire-membre');
    zone.classList.remove('cache');
    const estModification = !!membreExistant;
    zone.innerHTML = `
      <h3 style="margin-top:0;">${estModification ? 'Modifier le membre' : 'Ajouter un membre'}</h3>
      <div class="champ-inline"><label>Prénom</label><input id="nm-prenom" value="${membreExistant?.prenom || ''}"></div>
      <div class="champ-inline"><label>Nom</label><input id="nm-nom" value="${membreExistant?.nom || ''}"></div>
      <div class="champ-inline"><label>Téléphone</label><input id="nm-telephone" placeholder="+33600000000" value="${membreExistant?.telephone || ''}"></div>
      <div class="champ-inline"><label>Statut</label>
        <select id="nm-statut">
          <option value="membre">Membre</option>
          <option value="bureau">Bureau</option>
          <option value="honoraire">Honoraire</option>
        </select>
      </div>
      <button class="bouton-mini" id="nm-enregistrer">${estModification ? 'Enregistrer les modifications' : 'Enregistrer'}</button>
      <button class="bouton-mini bouton-mini--fantome" id="nm-annuler">Annuler</button>
      <div id="nm-message"></div>
    `;
    if (estModification) $('nm-statut').value = membreExistant.statut;

    $('nm-annuler').addEventListener('click', () => zone.classList.add('cache'));
    $('nm-enregistrer').addEventListener('click', async () => {
      const donnees = {
        prenom: $('nm-prenom').value.trim(),
        nom: $('nm-nom').value.trim(),
        telephone: $('nm-telephone').value.trim(),
        statut: $('nm-statut').value,
      };
      try {
        if (estModification) {
          await api(`/api/admin/membres/${membreExistant.id}`, { method: 'PUT', body: JSON.stringify(donnees) });
        } else {
          await api('/api/admin/membres', { method: 'POST', body: JSON.stringify(donnees) });
        }
        zone.classList.add('cache');
        await chargerMembres();
      } catch (err) {
        $('nm-message').innerHTML = `<div class="message message--erreur">${err.message}</div>`;
      }
    });
  }

  $('btn-nouveau-membre').addEventListener('click', () => ouvrirFormulaireMembre(null));

  $('input-csv').addEventListener('change', async (e) => {
    const fichier = e.target.files[0];
    if (!fichier) return;
    const formData = new FormData();
    formData.append('fichier', fichier);
    try {
      const r = await fetch('/api/admin/membres/import-csv', { method: 'POST', credentials: 'include', body: formData });
      const data = await r.json();
      if (!r.ok) throw new Error(data.erreur);
      $('resultat-import').innerHTML = `<div class="message message--info">${data.ajoutes} membre(s) ajouté(s), ${data.ignores} doublon(s) ignoré(s).${data.erreurs.length ? '<br>' + data.erreurs.join('<br>') : ''}</div>`;
      await chargerMembres();
    } catch (err) {
      $('resultat-import').innerHTML = `<div class="message message--erreur">${err.message}</div>`;
    }
    e.target.value = '';
  });

  // ================= PARAMÈTRES / CONTENU =================
  async function chargerParametres() {
    let params = [];
    try { params = await api('/api/admin/parametres'); } catch (e) { return; }
    $('liste-parametres').innerHTML = params.map(p => `
      <div class="parametre-bloc" data-cle="${p.cle}">
        <div class="cle">${p.cle}</div>
        <textarea>${p.valeur || ''}</textarea>
        <button class="bouton-mini">Enregistrer</button>
      </div>
    `).join('');
    document.querySelectorAll('.parametre-bloc button').forEach(btn => {
      btn.addEventListener('click', async () => {
        const bloc = btn.closest('.parametre-bloc');
        const cle = bloc.dataset.cle;
        const valeur = bloc.querySelector('textarea').value;
        btn.textContent = 'Enregistrement…';
        try {
          await api(`/api/admin/parametres/${encodeURIComponent(cle)}`, { method: 'PUT', body: JSON.stringify({ valeur }) });
          btn.textContent = 'Enregistré ✓';
        } catch (err) {
          btn.textContent = 'Erreur';
        }
        setTimeout(() => btn.textContent = 'Enregistrer', 1800);
      });
    });
  }

  // ================= STATUTS PDF =================
  $('form-statuts').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fichier = $('input-statuts').files[0];
    if (!fichier) return;
    const formData = new FormData();
    formData.append('fichier', fichier);
    try {
      const r = await fetch('/api/admin/statuts', { method: 'POST', credentials: 'include', body: formData });
      const data = await r.json();
      if (!r.ok) throw new Error(data.erreur);
      $('message-statuts').innerHTML = `<div class="message message--info">${data.message}</div>`;
    } catch (err) {
      $('message-statuts').innerHTML = `<div class="message message--erreur">${err.message}</div>`;
    }
  });

  // ================= JOURNAUX =================
  async function chargerLogs() {
    // Contrôles de purge, réservés au super-administrateur
    const zonePurge = $('actions-purge-logs');
    if (monRole === 'super_admin') {
      zonePurge.innerHTML = `
        <button class="bouton-mini bouton-mini--danger" id="btn-vider-journal">Vider tout le journal</button>
        <input id="purge-telephone" placeholder="+33600000000" style="padding:8px 10px;border:1px solid var(--line);border-radius:8px;font-family:var(--font-mono);font-size:0.85rem;">
        <button class="bouton-mini bouton-mini--fantome" id="btn-purge-membre">Effacer l'historique de ce numéro</button>
      `;
      $('btn-vider-journal').addEventListener('click', async () => {
        if (!confirm("Effacer DÉFINITIVEMENT tout le journal des connexions ?\n\nCette action est irréversible.")) return;
        try {
          const data = await api('/api/admin/logs/connexions', { method: 'DELETE' });
          alert(data.message);
          await chargerLogs();
        } catch (err) { alert(err.message); }
      });
      $('btn-purge-membre').addEventListener('click', async () => {
        const telephone = $('purge-telephone').value.trim();
        if (!telephone) { alert("Merci de saisir un numéro de téléphone."); return; }
        if (!confirm(`Effacer l'historique de connexion du numéro ${telephone} ?\n\nCette action est irréversible.`)) return;
        try {
          const data = await api(`/api/admin/logs/connexions?telephone=${encodeURIComponent(telephone)}`, { method: 'DELETE' });
          alert(data.message);
          $('purge-telephone').value = '';
          await chargerLogs();
        } catch (err) { alert(err.message); }
      });
    } else {
      zonePurge.innerHTML = '';
    }

    try {
      const logsConn = await api('/api/admin/logs/connexions');
      document.querySelector('#table-logs-connexions tbody').innerHTML = logsConn.map(l => `
        <tr><td>${new Date(l.cree_le + 'Z').toLocaleString('fr-FR')}</td><td style="font-family:var(--font-mono)">${l.telephone || '—'}</td><td>${l.action}</td><td>${l.ip || '—'}</td></tr>
      `).join('') || '<tr><td colspan="4">Aucun évènement.</td></tr>';
    } catch (e) {}

    if (monRole === 'super_admin') {
      try {
        const logsAdmin = await api('/api/admin/logs/admin');
        document.querySelector('#table-logs-admin tbody').innerHTML = logsAdmin.map(l => `
          <tr><td>${new Date(l.cree_le + 'Z').toLocaleString('fr-FR')}</td><td>${l.admin_email}</td><td>${l.action}</td><td>${l.details || '—'}</td></tr>
        `).join('') || '<tr><td colspan="4">Aucun évènement.</td></tr>';
      } catch (e) {}
    }
  }

  // ================= COMPTES ADMIN =================
  async function chargerComptes() {
    if (monRole !== 'super_admin') return;
    let comptes = [];
    try { comptes = await api('/api/admin/admins'); } catch (e) { return; }
    document.querySelector('#table-comptes tbody').innerHTML = comptes.map(c => `
      <tr><td>${c.email}</td><td>${c.role}</td><td>${c.totp_actif ? '<span class="badge badge--ok">Activée</span>' : '<span class="badge badge--off">Inactive</span>'}</td>
      <td>${c.actif ? '<span class="badge badge--ok">Oui</span>' : '<span class="badge badge--off">Non</span>'}</td>
      <td>${c.derniere_connexion ? new Date(c.derniere_connexion + 'Z').toLocaleString('fr-FR') : '—'}</td></tr>
    `).join('') || '<tr><td colspan="5">Aucun compte.</td></tr>';
  }

  $('btn-nouveau-compte').addEventListener('click', () => {
    const zone = $('formulaire-compte');
    zone.classList.remove('cache');
    zone.innerHTML = `
      <div class="champ-inline"><label>E-mail</label><input id="cp-email" type="email"></div>
      <div class="champ-inline"><label>Nom</label><input id="cp-nom"></div>
      <div class="champ-inline"><label>Mot de passe (12+ car.)</label><input id="cp-mdp" type="password"></div>
      <div class="champ-inline"><label>Rôle</label>
        <select id="cp-role"><option value="editeur">Éditeur de contenu</option><option value="gestionnaire_membres">Gestionnaire des membres</option><option value="super_admin">Super-administrateur</option></select>
      </div>
      <button class="bouton-mini" id="cp-enregistrer">Créer le compte</button>
      <div id="cp-message"></div>
    `;
    $('cp-enregistrer').addEventListener('click', async () => {
      try {
        await api('/api/admin/admins', { method: 'POST', body: JSON.stringify({
          email: $('cp-email').value.trim(), nom: $('cp-nom').value.trim(),
          motDePasse: $('cp-mdp').value, role: $('cp-role').value,
        }) });
        zone.classList.add('cache');
        await chargerComptes();
      } catch (err) {
        $('cp-message').innerHTML = `<div class="message message--erreur">${err.message}</div>`;
      }
    });
  });

  // ================= SÉCURITÉ (2FA) =================
  async function initSecurite() {
    const zone = $('zone-2fa');
    zone.innerHTML = `<button class="bouton-mini" id="btn-activer-2fa">Activer la double authentification</button><div id="zone-2fa-details"></div>`;
    $('btn-activer-2fa').addEventListener('click', async () => {
      try {
        const data = await api('/api/admin/2fa/initier', { method: 'POST' });
        $('zone-2fa-details').innerHTML = `
          <p class="aide">Ajoutez ce secret dans une application d'authentification (Google Authenticator, 1Password...) :</p>
          <p style="font-family:var(--font-mono); background:var(--cream-100); padding:10px; border-radius:8px; word-break:break-all;">${data.secret}</p>
          <div class="champ-inline"><label>Code affiché par l'application</label><input id="totp-confirmation" inputmode="numeric" maxlength="6"></div>
          <button class="bouton-mini" id="btn-confirmer-2fa">Confirmer l'activation</button>
          <div id="totp-message"></div>
        `;
        $('btn-confirmer-2fa').addEventListener('click', async () => {
          try {
            await api('/api/admin/2fa/confirmer', { method: 'POST', body: JSON.stringify({ codeTotp: $('totp-confirmation').value.trim() }) });
            $('totp-message').innerHTML = `<div class="message message--info">Double authentification activée.</div>`;
          } catch (err) {
            $('totp-message').innerHTML = `<div class="message message--erreur">${err.message}</div>`;
          }
        });
      } catch (err) { alert(err.message); }
    });
  }

  // Restauration de session au chargement
  (async function initial() {
    try {
      const moi = await api('/api/admin/moi');
      monRole = moi.role;
      await demarrerDashboard();
    } catch (e) { /* pas connecté */ }
  })();
})();
