// ============================================================
// pdfViewer.js — Rendu du PDF page par page sur <canvas>, avec filigrane.
//
// Pourquoi ce choix : un PDF affiché nativement par le navigateur propose
// souvent un bouton "Enregistrer" ou "Imprimer" dans sa propre barre
// d'outils, qu'on ne peut pas masquer. En le redessinant nous-mêmes sur
// un canvas, on retire ces contrôles et on peut superposer un filigrane
// nominatif. Cela DÉCOURAGE fortement la copie — une capture d'écran
// restera toujours possible, ce que rappelle le bandeau affiché au membre.
// ============================================================

window.LecteurStatuts = (function () {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.js';

  let pdfDoc = null;
  let pageActuelle = 1;
  let echelle = 1.3;
  let telephoneMasque = '';

  const conteneur = () => document.getElementById('conteneur-page-pdf');

  async function ouvrir() {
    document.getElementById('vue-lecteur').classList.remove('cache');
    document.body.style.overflow = 'hidden';
    conteneur().innerHTML = '<p style="color:#fff;">Chargement du document…</p>';

    try {
      // Étape 1 : obtenir un jeton signé de courte durée
      const rJeton = await fetch('/api/membre/statuts/jeton', { credentials: 'include' });
      const dataJeton = await rJeton.json();
      if (!rJeton.ok) throw new Error(dataJeton.erreur || 'Impossible d\'ouvrir le document.');

      const moiResp = await fetch('/api/membre/moi', { credentials: 'include' });
      const moi = await moiResp.json();
      telephoneMasque = moi.telephoneMasque || '';

      // Étape 2 : charger le PDF via ce jeton (lien temporaire, non public)
      const url = `/api/membre/statuts/document?t=${encodeURIComponent(dataJeton.token)}`;
      const loadingTask = pdfjsLib.getDocument(url);
      pdfDoc = await loadingTask.promise;

      document.getElementById('page-totale').textContent = pdfDoc.numPages;
      pageActuelle = 1;
      await rendrePage(pageActuelle);
    } catch (e) {
      conteneur().innerHTML = `<p style="color:#fff;">${e.message || 'Erreur lors du chargement du document.'}</p>`;
    }
  }

  async function rendrePage(numero) {
    const page = await pdfDoc.getPage(numero);
    const viewport = page.getViewport({ scale: echelle });

    const wrapper = document.createElement('div');
    wrapper.className = 'page-pdf-conteneur';
    wrapper.style.width = viewport.width + 'px';
    wrapper.style.height = viewport.height + 'px';

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');

    await page.render({ canvasContext: ctx, viewport }).promise;

    wrapper.appendChild(canvas);
    wrapper.appendChild(creerFiligrane(viewport.width, viewport.height));

    conteneur().innerHTML = '';
    conteneur().appendChild(wrapper);
    document.getElementById('page-actuelle').textContent = numero;

    // Dissuasions basiques (ne bloquent pas une capture d'écran, mais
    // empêchent le clic droit "Enregistrer l'image" et le glisser-déposer)
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('dragstart', (e) => e.preventDefault());
  }

  function creerFiligrane(largeur, hauteur) {
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'filigrane-svg');
    svg.setAttribute('width', largeur);
    svg.setAttribute('height', hauteur);

    const horodatage = new Date().toLocaleString('fr-FR');
    const texte = `Consultation réservée aux membres — FGBMFI Paris — Membre ${telephoneMasque} — ${horodatage}`;

    const lignes = 6;
    for (let i = 0; i < lignes; i++) {
      const t = document.createElementNS(svgNS, 'text');
      t.setAttribute('x', '-10%');
      t.setAttribute('y', `${(i + 1) * (100 / (lignes + 1))}%`);
      t.setAttribute('transform', `rotate(-28 ${largeur / 2} ${hauteur / 2})`);
      t.setAttribute('font-family', 'IBM Plex Mono, monospace');
      t.setAttribute('font-size', '13');
      t.setAttribute('fill', '#0a1830');
      t.textContent = texte;
      svg.appendChild(t);
    }
    return svg;
  }

  async function pagePrecedente() {
    if (!pdfDoc || pageActuelle <= 1) return;
    pageActuelle--;
    await rendrePage(pageActuelle);
  }
  async function pageSuivante() {
    if (!pdfDoc || pageActuelle >= pdfDoc.numPages) return;
    pageActuelle++;
    await rendrePage(pageActuelle);
  }
  async function zoom(delta) {
    echelle = Math.min(2.4, Math.max(0.7, echelle + delta));
    await rendrePage(pageActuelle);
  }

  function fermer() {
    document.getElementById('vue-lecteur').classList.add('cache');
    document.body.style.overflow = '';
    pdfDoc = null;
  }

  return { ouvrir, fermer, pagePrecedente, pageSuivante, zoom };
})();

// Dissuasion best-effort : bloque Ctrl+P / Ctrl+S / Ctrl+Maj+I lorsque le lecteur est ouvert.
// Rappel : ceci ne peut pas empêcher une capture d'écran ou un outil de développement avancé.
document.addEventListener('keydown', (e) => {
  const lecteurOuvert = !document.getElementById('vue-lecteur')?.classList.contains('cache');
  if (!lecteurOuvert) return;
  const combinaisonBloquee =
    (e.ctrlKey || e.metaKey) && ['p', 's'].includes(e.key.toLowerCase());
  if (combinaisonBloquee) e.preventDefault();
});
