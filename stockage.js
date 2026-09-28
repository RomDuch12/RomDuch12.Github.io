/* Stockage local (localStorage) avec consentement explicite.
   Seules données conservées, et uniquement si l'utilisateur accepte :
   - son tools.json, - ses opérations favorites, - ses DXF importés, - ses dessins et process TauDrive, - son thème, - les données de coupe lues dans son guide Datron.
   Rien n'est envoyé à un serveur ; tout reste dans ce navigateur. */
(function () {
  'use strict';
  const P = 'romduch.';
  const KEYS = ['tools', 'favoris', 'dxf', 'theme', 'coupe', 'lang', 'taudrive'];
  const ls = (() => { try { const s = window.localStorage; s.setItem(P + 't', '1'); s.removeItem(P + 't'); return s; } catch (e) { return null; } })();
  const ss = (() => { try { return window.sessionStorage; } catch (e) { return null; } })();

  const Stockage = {
    disponible: !!ls,
    consent() {
      try { if (ls && ls.getItem(P + 'consent') === 'oui') return 'oui'; if (ss && ss.getItem(P + 'consent') === 'non') return 'non'; } catch (e) { /* */ }
      return null;
    },
    actif() { return this.consent() === 'oui'; },
    setConsent(v) {
      try {
        if (v === 'oui') { ls && ls.setItem(P + 'consent', 'oui'); ss && ss.removeItem(P + 'consent'); }
        else { this.effacer(); ss && ss.setItem(P + 'consent', 'non'); }
      } catch (e) { /* */ }
      document.dispatchEvent(new CustomEvent('stockage-change', { detail: v }));
    },
    effacer() { try { if (ls) { KEYS.concat('consent').forEach(k => ls.removeItem(P + k)); } } catch (e) { /* */ } },
    get(k, def = null) {
      if (!this.actif()) return def;
      try { const v = ls.getItem(P + k); return v === null ? def : JSON.parse(v); } catch (e) { return def; }
    },
    set(k, v) {
      if (!this.actif()) return false;
      try { ls.setItem(P + k, JSON.stringify(v)); document.dispatchEvent(new CustomEvent('stockage-change', { detail: k })); return true; }
      catch (e) { alert((window.t || (x => x))("Stockage local plein ou indisponible : l'élément n'a pas été enregistré.")); return false; }
    },
    taille() { try { return KEYS.reduce((s, k) => s + ((ls && ls.getItem(P + k)) || '').length, 0); } catch (e) { return 0; } },
    /* nettoyage : toutes les données du site dans ce navigateur (local et session), consentement compris */
    inventaire() {
      const out = [];
      for (const st of [ls, ss]) { if (!st) continue; for (let i = 0; i < st.length; i++) { const k = st.key(i); if (k && (k.startsWith(P) || k.startsWith('i18n-') || k === 'taudrive-import')) out.push([st, k, (st.getItem(k) || '').length]); } }
      return out;
    },
    nettoyer() {
      const T = window.t || (x => x), inv = this.inventaire();
      if (!inv.length) { alert(T('Aucune donnée enregistrée par ce site dans ce navigateur.')); return; }
      const ko = Math.max(1, Math.round(inv.reduce((s, x) => s + x[2], 0) / 1024));
      if (!confirm(T('Effacer toutes les données enregistrées par ce site dans ce navigateur ({n} éléments, {k} ko) : outils, favoris, DXF, dessins TauDrive, guide DATRON lu, thème, langue et consentement ?', { n: inv.length, k: ko }))) return;
      inv.forEach(([st, k]) => { try { st.removeItem(k); } catch (e) { /* */ } });
      alert(T('Données effacées.')); location.reload();
    },

    /* ----- bannière de consentement ----- */
    banniere(force) {
      if (!ls) return;
      if (!force && this.consent() !== null) return;
      const old = document.getElementById('consent'); if (old) old.remove();
      const b = document.createElement('div');
      b.id = 'consent'; b.setAttribute('role', 'dialog'); b.setAttribute('aria-label', (window.t || (x => x))('Stockage local'));
      const T = window.t || (x => x);
      b.innerHTML = `<p><strong>${T('Mémoriser vos réglages dans ce navigateur ?')}</strong><br>
        ${T('Uniquement votre <em>tools.json</em>, vos opérations favorites, vos DXF importés, vos dessins et process TauDrive, votre thème, votre langue et les données de coupe lues dans votre guide DATRON, stockés localement (localStorage). Aucun traceur, aucune donnée envoyée. Vous pourrez tout effacer à tout moment.')}</p>
        <div><button type="button" class="primary" data-c="oui">${T('Accepter')}</button><button type="button" data-c="non">${T('Refuser')}</button></div>`;
      b.querySelectorAll('[data-c]').forEach(x => x.onclick = () => { this.setConsent(x.dataset.c); b.remove(); });
      document.body.append(b);
    }
  };
  window.Stockage = Stockage;

  const css = document.createElement('style');
  css.textContent = `#consent{position:fixed;left:16px;right:16px;bottom:16px;z-index:50;max-width:720px;margin:0 auto;background:var(--card);color:var(--ink);
    border:1px solid var(--line);border-left:4px solid var(--brass);border-radius:6px;padding:12px 16px;box-shadow:0 8px 30px rgba(0,0,0,.25);
    display:flex;gap:12px;align-items:center;flex-wrap:wrap}#consent p{margin:0;flex:1 1 320px;font-size:15px}#consent div{display:flex;gap:8px}`;
  document.head.append(css);
  document.addEventListener('DOMContentLoaded', () => {
    Stockage.banniere();
    document.querySelectorAll('[data-stockage-gerer]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); Stockage.banniere(true); }));
    const T = window.t || (x => x), foot = document.querySelector('footer p:last-child');
    if (foot && !document.querySelector('[data-stockage-effacer]')) foot.insertAdjacentHTML('beforeend', ` · <button type="button" class="datawipe" data-stockage-effacer>${T('Effacer mes données enregistrées')}</button>`);
    const GH = 'https://github.com/RomDuch12/RomDuch12.Github.io/blob/main/';
    if (foot && !document.querySelector('.licence')) foot.parentElement.insertAdjacentHTML('beforeend',
      `<p class="licence"><a href="${GH}LICENSE" rel="noopener">${T('Version web sous licence MIT')}</a> · <a href="${GH}NOTICE.md" rel="noopener">${T('Mentions et licences')}</a> · ${T('Données et marques DATRON : © DATRON AG')}</p>`);
    document.querySelectorAll('[data-stockage-effacer]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); Stockage.nettoyer(); }));
  });
})();
