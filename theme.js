/* Sélecteur de thème : 20 thèmes (15 sombres, 5 clairs) + automatique (système).
   Chargé dans <head> pour appliquer le thème avant l'affichage.
   Mémorisation : durable si le stockage local est accepté, sinon le temps de la session. */
(function () {
  'use strict';
  const THEMES = {
    sombres: [['laiton-nuit', 'Laiton nuit'], ['graphite', 'Graphite'], ['ocean', 'Océan'], ['foret', 'Forêt'], ['bordeaux', 'Bordeaux'],
      ['amethyste', 'Améthyste'], ['cuivre', 'Cuivre'], ['neon', 'Néon'], ['terminal', 'Terminal'], ['solarized-sombre', 'Solarized sombre'],
      ['nord', 'Nord'], ['dracula', 'Dracula'], ['ambre', 'Ambre'], ['ardoise', 'Ardoise'], ['minuit-rouge', 'Minuit rouge']],
    clairs: [['laiton-clair', 'Laiton clair'], ['papier', 'Papier'], ['ciel', 'Ciel'], ['menthe', 'Menthe'], ['solarized-clair', 'Solarized clair']]
  };
  const ALL = THEMES.sombres.concat(THEMES.clairs).map(t => t[0]);
  const root = document.documentElement, KEY = 'romduch.theme';
  const consent = () => { try { return localStorage.getItem('romduch.consent') === 'oui'; } catch (e) { return false; } };
  function lire() {
    try { return (consent() && localStorage.getItem(KEY)) || sessionStorage.getItem(KEY); } catch (e) { return null; }
  }
  function appliquer(t) {
    if (ALL.includes(t)) root.dataset.theme = t; else delete root.dataset.theme;
  }
  function choisir(t) {
    appliquer(t);
    try {
      if (ALL.includes(t)) { sessionStorage.setItem(KEY, t); if (consent()) localStorage.setItem(KEY, t); }
      else { sessionStorage.removeItem(KEY); localStorage.removeItem(KEY); }
    } catch (e) { /* stockage indisponible */ }
    document.querySelectorAll('[data-theme-select] select').forEach(s => { s.value = t || 'auto'; });
    window.dispatchEvent(new Event('resize'));          // redessine les canevas (visualiseur)
  }
  appliquer(lire());                                    // avant l'affichage : pas de flash

  window.Themes = { liste: THEMES, choisir, actuel: () => root.dataset.theme || 'auto' };
  document.addEventListener('DOMContentLoaded', () => {
    const opt = ([v, l]) => `<option value="${v}">${l}</option>`;
    document.querySelectorAll('[data-theme-select]').forEach(host => {
      host.classList.add('themesel');
      host.innerHTML = `<label>Thème <select aria-label="Thème de couleurs"><option value="auto">Automatique (système)</option>
        <optgroup label="Sombres (15)">${THEMES.sombres.map(opt).join('')}</optgroup>
        <optgroup label="Clairs (5)">${THEMES.clairs.map(opt).join('')}</optgroup></select></label>`;
      const s = host.querySelector('select');
      s.value = root.dataset.theme || 'auto';
      s.addEventListener('change', () => choisir(s.value));
    });
  });
  // le consentement accordé : on mémorise le thème en cours ; refusé : stockage.js efface tout
  document.addEventListener('stockage-change', e => {
    if (e.detail === 'oui' && root.dataset.theme) { try { localStorage.setItem(KEY, root.dataset.theme); } catch (x) { /* */ } }
  });
})();
