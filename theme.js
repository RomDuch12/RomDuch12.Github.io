/* Interrupteur mode clair / sombre.
   Par défaut : thème du système. Le choix manuel est gardé le temps de la session (onglet) seulement. */
(function () {
  'use strict';
  const root = document.documentElement, KEY = 'romduch.theme';
  const mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : { matches: false, addEventListener() {} };
  let choix = null;
  try { choix = sessionStorage.getItem(KEY); } catch (e) { /* stockage indisponible */ }
  if (choix === 'light' || choix === 'dark') root.dataset.theme = choix;   // appliqué avant l'affichage

  const actuel = () => root.dataset.theme || (mq.matches ? 'dark' : 'light');
  function maj() {
    document.querySelectorAll('[data-theme-toggle]').forEach(b => {
      const sombre = actuel() === 'dark';
      b.textContent = sombre ? '☀ Mode clair' : '☾ Mode sombre';
      b.setAttribute('aria-pressed', String(sombre));
      b.title = sombre ? 'Passer en mode clair' : 'Passer en mode sombre';
    });
  }
  function basculer() {
    const t = actuel() === 'dark' ? 'light' : 'dark';
    root.dataset.theme = t;
    try { sessionStorage.setItem(KEY, t); } catch (e) { /* */ }
    maj();
    window.dispatchEvent(new Event('resize'));          // redessine les canevas (visualiseur)
  }
  mq.addEventListener && mq.addEventListener('change', maj);
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-theme-toggle]').forEach(b => b.addEventListener('click', basculer));
    maj();
  });
})();
