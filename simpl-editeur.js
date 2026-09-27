/* Éditeur SimPL (CodeMirror 5) : coloration syntaxique, numéros de ligne, ligne courante, repli des blocs
   (program, BeginBlock, if…), recherche / remplacement, aller à la ligne, surlignage des occurrences,
   commentaire (Ctrl+/), retour à la ligne, zoom, barre d'état. SimplEditor.create(hôte, options) → promesse. */
(function () {
  'use strict';
  const tr = (s, v) => (window.t ? window.t(s, v) : s);
  const CDN = 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/';
  const CSS = ['codemirror.min.css', 'addon/dialog/dialog.min.css', 'addon/fold/foldgutter.min.css'];
  const JS = ['codemirror.min.js', 'addon/mode/simple.min.js', 'addon/dialog/dialog.min.js', 'addon/search/searchcursor.min.js', 'addon/search/search.min.js',
    'addon/search/jump-to-line.min.js', 'addon/scroll/annotatescrollbar.min.js', 'addon/search/matchesonscrollbar.min.js', 'addon/search/match-highlighter.min.js',
    'addon/selection/active-line.min.js', 'addon/edit/matchbrackets.min.js', 'addon/fold/foldcode.min.js', 'addon/fold/foldgutter.min.js', 'addon/comment/comment.min.js'];
  let ready = null;
  function load() {
    if (ready) return ready;
    CSS.forEach(f => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = CDN + f; document.head.append(l); });
    ready = JS.reduce((p, f) => p.then(() => new Promise((ok, ko) => { const s = document.createElement('script'); s.src = CDN + f; s.onload = ok; s.onerror = () => ko(new Error(f)); document.head.append(s); })), Promise.resolve())
      .then(define);
    return ready;
  }
  function define() {
    const CM = window.CodeMirror;
    CM.defineSimpleMode('simpl', {
      start: [
        { regex: /#.*/, token: 'comment' }, { regex: /\/\/.*/, token: 'comment' },
        { regex: /@[^@]*@?/, token: 'meta' },
        { regex: /"(?:[^\\"]|\\.)*"?/, token: 'string' },
        { regex: /\$\$\$.*/, token: 'meta' },
        { regex: /\b(?:export|program|endprogram|returns|return|module|using|import|sequence|end|if|else|elseif|endif|while|endwhile|for|endfor|to|step|and|or|not|true|false|var)\b/, token: 'keyword' },
        { regex: /\b(?:BeginBlock|EndBlock|Absolute|Relative)\b/, token: 'def' },
        { regex: /\b[A-Z][A-Za-z0-9_]*(?=\s*\()/, token: 'builtin' },
        { regex: /\b(?:Tool|Rpm|Spindle|SpraySystem|SetFeedTechnology|Feed|Rapid|SafeRapid|Line|Arc|MoveToParkPosition|MoveToSafetyPosition|Dialog|ShiftWcsInc|On|Off|CW|CCW|Roughing|Finishing|Plunge|Ramp|Approach|skipRestoring)\b/, token: 'builtin' },
        { regex: /\b[A-Za-z_]\w*(?=\s*=)/, token: 'attribute' },
        { regex: /[A-Za-z_]\w*/, token: null },
        { regex: /[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/i, token: 'number' },
        { regex: /[=<>+\-*/]+/, token: 'operator' },
        { regex: /[([{]/, indent: true }, { regex: /[)\]}]/, dedent: true }
      ],
      meta: { lineComment: '#' }
    });
    // repli : program…endprogram, BeginBlock…EndBlock, if…endif, while/for, sequence…ligne vide
    const PAIRS = [[/^\s*(?:export\s+)?program\b/, /^\s*endprogram\b/], [/^\s*BeginBlock\b/, /^\s*EndBlock\b/], [/^\s*if\b/, /^\s*endif\b/],
      [/^\s*while\b/, /^\s*endwhile\b/], [/^\s*for\b/, /^\s*endfor\b/], [/^\s*[A-Za-z_]\w*\s*\($/, /^\s*\)\s*$/]];
    CM.registerHelper('fold', 'simpl', (cm, start) => {
      const text = cm.getLine(start.line);
      for (const [open, close] of PAIRS) {
        if (!open.test(text)) continue;
        let depth = 0;
        for (let i = start.line + 1, n = cm.lastLine(); i <= n; i++) {
          const l = cm.getLine(i);
          if (open.test(l)) depth++;
          else if (close.test(l)) { if (!depth) return i > start.line + 1 ? { from: CM.Pos(start.line, text.length), to: CM.Pos(i - 1, cm.getLine(i - 1).length) } : undefined; depth--; }
        }
      }
      if (/^\s*sequence\s+\w+/.test(text) && /\$\$\$|^\s*(Line|Arc)/.test(cm.getLine(start.line + 1) || '')) {
        let i = start.line + 1; while (i < cm.lastLine() && cm.getLine(i + 1).trim()) i++;
        return { from: CM.Pos(start.line, text.length), to: CM.Pos(i, cm.getLine(i).length) };
      }
      return undefined;
    });
  }
  const PH = () => ({ 'Search:': tr('Rechercher :'), '(Use /re/ syntax for regexp search)': tr('(syntaxe /re/ pour une expression régulière)'), 'Replace:': tr('Remplacer :'),
    'With:': tr('Par :'), 'Replace?': tr('Remplacer ?'), 'Yes': tr('Oui'), 'No': tr('Non'), 'All': tr('Tout'), 'Stop': tr('Arrêter'), 'Replace all:': tr('Tout remplacer :'),
    'Jump to line:': tr('Aller à la ligne :'), '(Use line:column or scroll% syntax)': tr('(ligne:colonne ou pourcentage%)') });
  const I = (d) => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICON = {
    search: I('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>'), replace: I('<path d="M3 7h13l-3-3M21 17H8l3 3"/>'), jump: I('<path d="M4 6h10M4 12h16M4 18h7"/><path d="m17 15 3 3-3 3"/>'),
    fold: I('<path d="m7 14 5-5 5 5"/>'), unfold: I('<path d="m7 10 5 5 5-5"/>'), wrap: I('<path d="M3 6h18M3 12h15a3 3 0 0 1 0 6h-4"/><path d="m16 16-2 2 2 2M3 18h7"/>'),
    minus: I('<path d="M5 12h14"/>'), plus: I('<path d="M12 5v14M5 12h14"/>'), copy: I('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>'),
    comment: I('<path d="M4 20 20 4M9 20h11"/>')
  };
  function create(host, opts = {}) {
    return load().then(() => {
      const CM = window.CodeMirror;
      host.classList.add('sed');
      host.innerHTML = `<div class="sed-bar" role="toolbar" aria-label="${tr('Outils de l\'éditeur')}">
        <button type="button" data-c="find" title="${tr('Rechercher (Ctrl+F)')}">${ICON.search}</button>
        ${opts.readOnly ? '' : `<button type="button" data-c="replace" title="${tr('Remplacer (Maj+Ctrl+F)')}">${ICON.replace}</button>`}
        <button type="button" data-c="jumpToLine" title="${tr('Aller à la ligne (Alt+G)')}">${ICON.jump}</button>
        <span class="sed-sep"></span>
        <button type="button" data-c="foldAll" title="${tr('Tout replier')}">${ICON.fold}</button>
        <button type="button" data-c="unfoldAll" title="${tr('Tout déplier')}">${ICON.unfold}</button>
        ${opts.readOnly ? '' : `<button type="button" data-c="toggleComment" title="${tr('Commenter / décommenter (Ctrl+/)')}">${ICON.comment}</button>`}
        <button type="button" data-c="wrap" title="${tr('Retour à la ligne')}" aria-pressed="false">${ICON.wrap}</button>
        <span class="sed-sep"></span>
        <button type="button" data-c="smaller" title="${tr('Réduire le texte')}">${ICON.minus}</button>
        <button type="button" data-c="bigger" title="${tr('Agrandir le texte')}">${ICON.plus}</button>
        <button type="button" data-c="copy" title="${tr('Copier tout')}">${ICON.copy}</button>
        <span class="sed-extra"></span></div><div class="sed-cm"></div><div class="sed-status" aria-live="polite"></div>`;
      const cm = CM(host.querySelector('.sed-cm'), {
        value: opts.value || '', mode: 'simpl', theme: 'romduch', lineNumbers: true, styleActiveLine: true, matchBrackets: true, readOnly: !!opts.readOnly,
        foldGutter: true, gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'], foldOptions: { rangeFinder: CM.fold.simpl, widget: '⋯' },
        highlightSelectionMatches: { showToken: /\w/, annotateScrollbar: true }, indentUnit: 4, tabSize: 4, lineWrapping: false, phrases: PH(),
        extraKeys: { 'Ctrl-/': 'toggleComment', 'Cmd-/': 'toggleComment', 'Alt-G': 'jumpToLine', 'Ctrl-Q': c => c.foldCode(c.getCursor()) }
      });
      let size = 13;
      const st = host.querySelector('.sed-status');
      const status = () => { const c = cm.getCursor(), sel = cm.getSelection();
        st.textContent = tr('Ln {l}, Col {c}', { l: c.line + 1, c: c.ch + 1 }) + ' · ' + tr('{n} lignes', { n: cm.lineCount() }) + (sel ? ' · ' + tr('{n} car. sélectionnés', { n: sel.length }) : '') + (opts.readOnly ? ' · ' + tr('lecture seule') : ''); };
      cm.on('cursorActivity', status); status();
      host.querySelectorAll('[data-c]').forEach(b => b.addEventListener('click', () => {
        const c = b.dataset.c;
        if (c === 'wrap') { const v = !cm.getOption('lineWrapping'); cm.setOption('lineWrapping', v); b.setAttribute('aria-pressed', v); }
        else if (c === 'smaller' || c === 'bigger') { size = Math.max(9, Math.min(24, size + (c === 'bigger' ? 1 : -1))); host.style.setProperty('--sed-size', size + 'px'); cm.refresh(); }
        else if (c === 'copy') { navigator.clipboard && navigator.clipboard.writeText(cm.getValue()).then(() => { st.textContent = tr('Programme copié.'); }); }
        else cm.execCommand(c);
        if (c !== 'copy') cm.focus();
      }));
      let tm = 0;
      if (opts.onChange) cm.on('change', (_, ch) => { if (ch.origin === 'setValue') return; clearTimeout(tm); tm = setTimeout(() => opts.onChange(cm.getValue()), opts.delay || 400); });
      let cur = null;
      const api = {
        cm, host, extra: host.querySelector('.sed-extra'),
        getValue: () => cm.getValue(),
        setValue(v) { if (v !== cm.getValue()) { const sc = cm.getScrollInfo(); cm.setValue(v); cm.scrollTo(sc.left, sc.top); } status(); },
        mark(line, scroll) {                      // ligne en cours (visualiseur)
          if (cur !== null) cm.removeLineClass(cur, 'background', 'sed-cur');
          cur = line >= 0 && line < cm.lineCount() ? line : null;
          if (cur !== null) { cm.addLineClass(cur, 'background', 'sed-cur'); if (scroll) cm.scrollIntoView({ line: cur, ch: 0 }, 80); }
        },
        refresh: () => cm.refresh()
      };
      return api;
    });
  }
  // thème aux couleurs du site
  const css = document.createElement('style');
  css.textContent = `.sed{display:flex;flex-direction:column;min-width:0;--sed-size:13px}
.sed-bar{display:flex;flex-wrap:wrap;gap:3px;align-items:center;padding:4px 6px;border-bottom:1px solid var(--line);background:var(--card)}
.sed-bar button{display:inline-flex;align-items:center;justify-content:center;width:30px;height:28px;padding:0;border:1px solid transparent;border-radius:5px;background:none;color:var(--mute);cursor:pointer}
.sed-bar button:hover,.sed-bar button[aria-pressed="true"]{border-color:var(--line);color:var(--ink);background:var(--bg)}
.sed-sep{width:1px;height:20px;background:var(--line);margin:0 3px}.sed-extra{margin-left:auto;display:flex;gap:4px;flex-wrap:wrap}
.sed-cm{flex:1;min-height:0}.sed .CodeMirror{height:100%;min-height:220px;font:400 var(--sed-size)/1.55 "JetBrains Mono",Consolas,monospace}
.sed-status{padding:3px 10px;font:400 12px Barlow,sans-serif;color:var(--mute);border-top:1px solid var(--line);background:var(--card)}
.cm-s-romduch.CodeMirror{background:var(--bg);color:var(--ink)}
.cm-s-romduch .CodeMirror-gutters{background:var(--card);border-right:1px solid var(--line)}
.cm-s-romduch .CodeMirror-linenumber{color:var(--mute)}.cm-s-romduch .CodeMirror-cursor{border-left:2px solid var(--brass)}
.cm-s-romduch .CodeMirror-activeline-background{background:color-mix(in srgb,var(--brass) 10%,transparent)}
.cm-s-romduch .CodeMirror-selected,.cm-s-romduch .CodeMirror-focused .CodeMirror-selected{background:color-mix(in srgb,var(--brass) 28%,transparent)}
.cm-s-romduch .cm-comment{color:var(--mute);font-style:italic}.cm-s-romduch .cm-keyword{color:var(--brass);font-weight:700}
.cm-s-romduch .cm-def{color:var(--brass-l);font-weight:700}.cm-s-romduch .cm-builtin{color:var(--rapid);font-weight:600}
.cm-s-romduch .cm-string{color:color-mix(in srgb,#43a047 70%,var(--ink))}.cm-s-romduch .cm-number{color:color-mix(in srgb,#ef8a17 75%,var(--ink))}
.cm-s-romduch .cm-attribute{color:color-mix(in srgb,#3d8bd9 70%,var(--ink))}.cm-s-romduch .cm-meta{color:color-mix(in srgb,#9c5ce0 70%,var(--ink))}.cm-s-romduch .cm-operator{color:var(--mute)}
.cm-s-romduch .CodeMirror-matchingbracket{outline:1px solid var(--brass);color:inherit!important}
.cm-s-romduch .cm-matchhighlight{background:color-mix(in srgb,var(--brass) 20%,transparent)}
.cm-s-romduch .CodeMirror-foldmarker{color:var(--brass);text-shadow:none;font-family:inherit}
.sed .CodeMirror-dialog{background:var(--card);color:var(--ink);border-color:var(--line)!important}.sed .CodeMirror-dialog input{color:var(--ink);font:inherit}
.sed-cur{background:color-mix(in srgb,var(--brass) 45%,transparent)!important}`;
  document.head.append(css);
  window.SimplEditor = { create, load };
})();
