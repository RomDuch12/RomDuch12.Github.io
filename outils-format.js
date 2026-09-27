/* Formats de bibliothèque d'outils : format du site (liste « tools ») et format NeoDrive bureau
   (objet « tools » indexé par identifiant, champs feed_*, geometry, type_taraudage). */
(function () {
  'use strict';
  const T = (s, v) => (window.t ? window.t(s, v) : s);
  const num = v => (v === null || v === undefined || v === '' || !Number.isFinite(+v) ? undefined : +v);
  // type NeoDrive bureau (type_taraudage) → type du site
  function typeDe(tt, name) {
    const s = String(tt || '').replace(/\s+/g, '');
    if (/^Cyl/i.test(s)) return 'fraise';
    if (/^Con/i.test(s)) return 'gravure';
    if (/^Cham/i.test(s)) return 'chanfrein';
    if (/^ExtRad/i.test(s)) return 'rayon';
    if (/^Ball|^Boule/i.test(s)) return 'boule';
    if (/^Tor/i.test(s)) return 'torique';
    if (/^Drill|^Foret/i.test(s)) return 'foret';
    if (/^Face|^Surf/i.test(s)) return 'surfacage';
    if (/^M\d|^Thr/i.test(s) || /^Thr/i.test(name || '')) return 'filetage';
    return 'fraise';
  }
  // type du site → type NeoDrive bureau
  function typeVers(o) {
    const d = +o.diameter || 0, g = x => String(+(+x).toFixed(2));
    switch (o.type) {
      case 'gravure': return 'Con' + g(o.tipAngle || 0);
      case 'chanfrein': return 'Chamfer';
      case 'rayon': return 'ExtRad';
      case 'foret': return 'Drill';
      case 'filetage': return (String(o.thread || '').match(/M\d+(?:[.,]\d+)?/) || ['M'])[0].replace(',', '.');
      default: return 'Cyl' + g(d);
    }
  }
  function depuisBureau(id, v) {
    const geo = v.geometry || {}, fl = {};
    [['roughing', 'feed_roughing'], ['finishing', 'feed_finishing'], ['plunge', 'feed_plunge'], ['ramp', 'feed_ramp'], ['approach', 'feed_approach']]
      .forEach(([k, b]) => { const x = num(v[b]); if (x !== undefined) fl[k] = x; });
    const type = typeDe(v.type_taraudage, v.name);
    const o = {
      id, name: v.name || id, type, articleNr: String(v.reference || '').split('/')[0].trim() || undefined, vendor: v.vendor || undefined,
      diameter: num(geo.Diameter) || num(v.diameter), fluteLength: num(geo.FluteLength), flutes: num(geo.NumberOfFlutes),
      tipAngle: num(geo.TipAngle), tipDiameter: num(geo.TipDiameter), rpm: num(v.rpm), feeds: fl,
      coolant: v.coolant || undefined, notes: v.notes || undefined, minDepth: num(v.min_depth), maxDepth: num(v.max_depth), refBureau: v.reference || undefined
    };
    if (type === 'filetage') o.thread = String(v.type_taraudage || '').replace(/\s+/g, '');
    if (type !== 'gravure' && o.tipDiameter === o.diameter) delete o.tipDiameter;
    Object.keys(o).forEach(k => o[k] === undefined && delete o[k]);
    return o;
  }
  /* Rend toujours { ...json, tools: [...] } au format du site. Lève une erreur explicite sinon. */
  function normaliser(j) {
    if (Array.isArray(j)) j = { tools: j };
    if (!j || typeof j !== 'object') throw new Error(T('fichier JSON attendu'));
    let tools = j.tools ?? j.Tools ?? j.outils;
    if (tools && !Array.isArray(tools) && typeof tools === 'object') {
      tools = Object.entries(tools).map(([id, v]) => (v && typeof v === 'object' ? depuisBureau(id, v) : null)).filter(Boolean);
      const { version, last_modified, ...rest } = j;
      return { ...rest, tools, _importe: T('converti depuis le format NeoDrive bureau') };
    }
    if (!Array.isArray(tools)) throw new Error(T('clé « tools » absente'));
    return { ...j, tools: tools.map(o => (o && o.feed_roughing !== undefined && !o.feeds ? depuisBureau(o.id || o.name, o) : o)) };
  }
  /* Export au format NeoDrive bureau */
  function versBureau(lib) {
    const tools = {};
    for (const o of lib.tools || []) {
      const f = o.feeds || {};
      tools[o.id] = {
        name: o.name, reference: o.refBureau || o.articleNr || '', type_taraudage: typeVers(o), rpm: o.rpm ?? null,
        feed_finishing: f.finishing ?? null, feed_approach: f.approach ?? null, feed_plunge: f.plunge ?? null, feed_ramp: f.ramp ?? null, feed_roughing: f.roughing ?? null,
        diameter: o.diameter ?? 0, coolant: o.coolant || 'spray', vendor: o.vendor || '', min_depth: o.minDepth ?? null, max_depth: o.maxDepth ?? (o.fluteLength ?? null),
        notes: o.notes || '', last_used: null, usage_count: 0,
        geometry: { Diameter: o.diameter ?? 0, TipAngle: o.tipAngle ?? 0, TipDiameter: o.tipDiameter ?? o.diameter ?? 0, NumberOfFlutes: o.flutes ?? 1, FluteLength: o.fluteLength ?? 0 }
      };
    }
    return { version: '1.0', last_modified: new Date().toISOString().slice(0, 19), tools };
  }
  window.OutilsFormat = { normaliser, versBureau };
})();
