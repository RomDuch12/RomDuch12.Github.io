/* Traductions du site (FR par défaut ; EN, DE, IT, ES, ZH, RU).
   Clé = texte français d'origine. Textes générés : t('texte {x}', {x}). Textes statiques : attribut data-i18n
   (contenu HTML de l'élément) et data-i18n-attr="placeholder,title,aria-label" (attributs).
   Langue : choix mémorisé (session, ou durable si le stockage local est accepté), sinon langue du navigateur. */
(function () {
  'use strict';
  const LANGS = { fr: 'Français', en: 'English', de: 'Deutsch', it: 'Italiano', es: 'Español', zh: '中文', ru: 'Русский' };
  const LOCALES = { fr: 'fr-FR', en: 'en-GB', de: 'de-DE', it: 'it-IT', es: 'es-ES', zh: 'zh-CN', ru: 'ru-RU' };
  const KEY = 'romduch.lang';
  const consent = () => { try { return localStorage.getItem('romduch.consent') === 'oui'; } catch (e) { return false; } };
  function lire() {
    try { const v = (consent() && localStorage.getItem(KEY)) || sessionStorage.getItem(KEY); if (LANGS[v]) return v; } catch (e) { /* */ }
    const nav = (navigator.languages || [navigator.language || 'fr']).map(l => String(l).slice(0, 2).toLowerCase());
    return nav.find(l => LANGS[l]) || 'fr';
  }
  const lang = lire();
  const DICT = {};
  const norm = s => String(s).replace(/\s+/g, ' ').trim();

  // mode collecte (outil de traduction) : sessionStorage « i18n-collect » = 1 enregistre toutes les clés utilisées
  const COL = (() => { try { return sessionStorage.getItem('i18n-collect') === '1'; } catch (e) { return false; } })();
  const KEYS = new Set();
  function t(fr, vars) {
    if (COL && fr) KEYS.add(norm(fr));
    let s = fr;
    if (lang !== 'fr') { const d = DICT[lang] || {}; s = d[fr] ?? d[norm(fr)] ?? fr; }
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
    return s;
  }
  function apply(root = document) {
    if (COL) {
      root.querySelectorAll('[data-i18n]').forEach(el => KEYS.add(norm(el.dataset.i18nSrc || el.innerHTML)));
      root.querySelectorAll('[data-i18n-attr]').forEach(el => el.dataset.i18nAttr.split(',').forEach(a => { const v = el.getAttribute(a.trim()); if (v) KEYS.add(norm(v)); }));
      if (root === document) document.title.split(' – ').forEach(p => KEYS.add(norm(p)));
    }
    if (lang === 'fr') return;
    if (root === document) document.title = document.title.split(' – ').map(p => t(p)).join(' – ');
    root.querySelectorAll('[data-i18n]').forEach(el => {
      if (!el.dataset.i18nSrc) el.dataset.i18nSrc = norm(el.innerHTML);
      const tr = (DICT[lang] || {})[el.dataset.i18nSrc];
      if (tr !== undefined) el.innerHTML = tr;
    });
    root.querySelectorAll('[data-i18n-attr]').forEach(el => {
      el.dataset.i18nAttr.split(',').map(a => a.trim()).forEach(a => {
        const v = el.getAttribute(a); if (v) el.setAttribute(a, t(v));
      });
    });
  }
  function choisir(l) {
    if (!LANGS[l]) return;
    try { sessionStorage.setItem(KEY, l); if (consent()) localStorage.setItem(KEY, l); } catch (e) { /* */ }
    location.reload();
  }
  const fmt = (n, opts) => Number(n).toLocaleString(LOCALES[lang], opts);

  window.I18N = { lang, LANGS, locale: LOCALES[lang], add: (l, d) => { DICT[l] = Object.assign(DICT[l] || {}, d); }, apply, choisir, t, fmt,
    cles: () => [...KEYS], manquantes: () => [...KEYS].filter(k => !(DICT[lang] || {})[k]) };
  window.t = t;
  document.documentElement.lang = lang === 'zh' ? 'zh-Hans' : lang;
  if (lang !== 'fr') document.write(`<script src="lang/${lang}.js"><\/script>`);   // table chargée avant les autres scripts

  document.addEventListener('DOMContentLoaded', () => {
    apply();
    document.querySelectorAll('[data-lang-select]').forEach(host => {
      host.classList.add('themesel');
      host.innerHTML = `<label>${t('Langue')} <select aria-label="${t('Langue du site')}">${Object.entries(LANGS).map(([k, v]) =>
        `<option value="${k}"${k === lang ? ' selected' : ''}>${v}</option>`).join('')}</select></label>`;
      host.querySelector('select').addEventListener('change', e => choisir(e.target.value));
    });
  });
  document.addEventListener('stockage-change', e => {
    if (e.detail === 'oui') { try { localStorage.setItem(KEY, lang); } catch (x) { /* */ } }
  });
})();
