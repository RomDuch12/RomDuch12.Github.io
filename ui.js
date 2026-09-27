/* Interface commune : icônes (Lucide), barre d'onglets mobile, retour en haut de page.
   Les icônes sont posées selon des sélecteurs (ICONES) ou l'attribut data-icon, y compris sur le contenu créé plus tard. */
(function () {
  'use strict';
  const tr = (s, v) => (window.t ? window.t(s, v) : s);
  const NAV = { 'index.html': 'house', 'neodrive.html': 'cpu', 'taudrive.html': 'zap', 'tuto.html': 'graduation-cap', 'cv.html': 'user-round',
    'outils.html': 'wrench', 'coupe.html': 'gauge', 'tauconvert.html': 'repeat-2' };
  const ANCRES = { 'sec-gen': 'wand-sparkles', 'sec-viewer': 'scan-eye', 'sec-videos': 'clapperboard', 'sec-td-draw': 'pen-tool', 'sec-td-job': 'file-cog', 'sec-td-viewer': 'scan-eye' };
  const ICONES = [
    // TauDrive
    ['[data-td=undo]', 'undo-2'], ['[data-td=redo]', 'redo-2'], ['[data-td=rect]', 'square'], ['[data-td=ellipse]', 'circle'], ['[data-td=text]', 'type'],
    ['[data-td=line]', 'slash'], ['[data-td=code]', 'qr-code'], ['[data-td=dxf]', 'file-input'], ['[data-td=coupon]', 'grid-3x3'], ['[data-td=dup]', 'copy'],
    ['[data-td=center]', 'crosshair'], ['[data-td=up]', 'arrow-up'], ['[data-td=down]', 'arrow-down'], ['[data-td=del]', 'trash-2'], ['[data-td=fit]', 'maximize'],
    ['[data-td=nouveau]', 'file-plus'], ['[data-td=open]', 'folder-open'], ['[data-td=saveFile]', 'save'], ['#td-gen', 'cog'], ['#td-vplay', 'play'], ['#play', 'play'],
    ['#td-vopen', 'folder-open'], ['#td-zip', 'file-archive'], ['#td-to-viewer', 'scan-eye'], ['[data-dl]', 'download'], ['#td-proc-save', 'save'], ['#td-proc-del', 'trash-2'],
    ['#td-proc-all', 'copy-check'], ['#td-dxf-ok', 'check'], ['#td-coupon-ok', 'check'],
    // NeoDrive
    ['[data-a=fav]', 'star'], ['[data-a=toggle]', 'chevrons-up-down'], ['[data-a=up]', 'arrow-up'], ['[data-a=down]', 'arrow-down'], ['[data-a=del]', 'trash-2'],
    ['[data-add]', 'plus'], ['#g-gen', 'wand-sparkles'], ['#g-view', 'scan-eye'], ['#g-dl', 'download'], ['#gt-demo', 'package'], ['#gt-load', 'upload'],
    ['.btnlink[href="outils.html"]', 'wrench'], ['#load', 'folder-open'], ['[data-all="1"]', 'fold-vertical'], ['[data-all="0"]', 'unfold-vertical'],
    // éditeur d'outils
    ['[data-l=imp]', 'upload'], ['[data-l=demo]', 'package'], ['[data-l=exp]', 'download'], ['[data-l=expb]', 'hard-drive-download'], ['[data-l=save]', 'save'],
    ['[data-l=undo]', 'rotate-ccw'], ['[data-l=consent]', 'database'], ['[data-l=clear]', 'trash-2'], ['#b-new', 'plus'], ['#b-reset', 'filter-x'], ['#b-prop-all', 'sparkles'],
    ['#b-fold', 'fold-vertical'], ['#b-unfold', 'unfold-vertical'], ['[data-a=prop]', 'sparkles'], ['[data-a=dup]', 'copy'], ['[data-a=shop]', 'external-link'], ['[data-ref]', 'plus'],
    // TauConvert
    ['#tc-out [data-f]', 'download'], ['#tc-taudrive', 'zap'], ['#tc-dl', 'download'],
    // commun
    ['[data-stockage-gerer]', 'database'], ['.datawipe', 'eraser']
  ];
  const GLYPHES = /^[\s▲▼↶↷▭◯／▦☆★✕+]*$/;
  let lucideOk = false;
  function poser(el, nom) {
    if (el.querySelector(':scope > svg.lucide, :scope > i[data-lucide]')) return;
    const i = document.createElement('i'); i.setAttribute('data-lucide', nom); i.setAttribute('aria-hidden', 'true');
    if (el.tagName === 'BUTTON' && GLYPHES.test(el.textContent)) { el.textContent = ''; el.classList.add('ico-only'); }
    else if (el.tagName === 'BUTTON') el.firstChild && el.firstChild.nodeType === 3 && (el.firstChild.textContent = el.firstChild.textContent.replace(/^[▭◯／▦☆★+]\s*/, ''));
    el.prepend(i);
  }
  function decorer() {
    document.querySelectorAll('.sitenav a, .subnav a, #tabbar a').forEach(a => {
      const h = a.getAttribute('href') || '', f = h.split('#')[0] || location.pathname.split('/').pop() || 'index.html', an = h.split('#')[1];
      const nom = (an && ANCRES[an]) || NAV[f]; if (nom) poser(a, nom);
    });
    ICONES.forEach(([sel, nom]) => document.querySelectorAll(sel).forEach(el => poser(el, nom)));
    document.querySelectorAll('[data-icon]').forEach(el => poser(el, el.dataset.icon));
    if (window.lucide && lucideOk) lucide.createIcons({ attrs: { 'aria-hidden': 'true' } });
  }
  let raf = 0;
  const plus_tard = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; decorer(); }); };
  function tabbar() {
    const nav = document.querySelector('.sitenav'); if (!nav || document.getElementById('tabbar')) return;
    const bar = document.createElement('nav'); bar.id = 'tabbar'; bar.setAttribute('aria-label', tr('Navigation'));
    nav.querySelectorAll('a').forEach(a => { const c = a.cloneNode(true); c.querySelectorAll('svg,i').forEach(x => x.remove()); bar.append(c); });
    document.body.append(bar);
  }
  function totop() {
    const b = document.createElement('button'); b.id = 'totop'; b.type = 'button'; b.setAttribute('aria-label', tr('Haut de page')); b.title = tr('Haut de page');
    b.innerHTML = '<i data-lucide="arrow-up-to-line"></i>'; b.onclick = () => scrollTo({ top: 0 });
    document.body.append(b);
    addEventListener('scroll', () => b.classList.toggle('show', scrollY > 700), { passive: true });
  }
  document.addEventListener('DOMContentLoaded', () => {
    tabbar(); totop();
    const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/lucide@0.460.0/dist/umd/lucide.min.js';
    s.onload = () => { lucideOk = true; decorer(); new MutationObserver(plus_tard).observe(document.body, { childList: true, subtree: true }); };
    document.head.append(s);
    decorer();
  });
})();
