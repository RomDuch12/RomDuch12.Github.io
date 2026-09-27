/* Données de coupe pour fraises 1 dent DATRON (aluminium 200–400 N/mm²).
   1) Modèle : coefficients ajustés sur le « DATRON High-Speed Cutting Guide »
      (régression log-log sur D1 et L2/D1, par broche et stratégie). Valeurs indicatives.
   2) Valeurs exactes : lues localement dans VOTRE exemplaire du guide (PDF), rien n'est publié ni envoyé.
   Guide officiel : https://www.datron.com/wp-content/uploads/2022/11/DATRON-High-Speed-Cutting-Guide.pdf */
(function () {
  'use strict';
  const tr = (s, v) => (window.t ? window.t(s, v) : s);
  const GUIDE_URL = 'https://www.datron.com/wp-content/uploads/2022/11/DATRON-High-Speed-Cutting-Guide.pdf';
  // modèle : grandeur = exp(c0 + c1·ln D1 + c2·ln(L2/D1)) ; n plafonnée à n_max
  const MODEL = {"1,8 kW":{"plein":{"n":[10.7761,-0.1886,-0.0285],"n_max":46000,"fz":[-3.3063,0.7925,-0.2705],"ap":[-0.0819,0.2343,-0.6636],"ae":[0.0,1.0,0.0],"d":[0.3,10.0],"l2d":[1.0,7.5]},"partiel":{"n":[10.7761,-0.1886,-0.0285],"n_max":46000,"fz":[-3.2926,0.8145,-0.4526],"ap":[-0.3567,1.0975,1.1047],"ae":[-0.7673,0.3391,-0.9099],"d":[0.3,10.0],"l2d":[1.0,7.5]}},"2 kW":{"plein":{"n":[10.9129,-0.1524,-0.0289],"n_max":52000,"fz":[-3.4546,0.9194,-0.2985],"ap":[-0.2639,0.2403,-0.5648],"ae":[0.0,1.0,0.0],"d":[0.3,8.0],"l2d":[1.1,7.5]},"partiel":{"n":[10.913,-0.1368,-0.0355],"n_max":52000,"fz":[-3.4228,0.8836,-0.5358],"ap":[-0.3656,1.1002,1.1108],"ae":[-1.0929,0.4064,-0.7272],"d":[0.3,8.0],"l2d":[1.0,7.5]}},"2 kW neo":{"plein":{"n":[10.6576,-0.1293,-0.0223],"n_max":40000,"fz":[-3.2589,0.8455,-0.2417],"ap":[-0.1363,0.2951,-0.6559],"ae":[-0.0,1.0,0.0],"d":[0.3,8.0],"l2d":[1.0,7.5]},"partiel":{"n":[10.6576,-0.1293,-0.0223],"n_max":40000,"fz":[-3.2356,0.8538,-0.483],"ap":[-0.3656,1.1002,1.1108],"ae":[-0.9849,0.4727,-0.8054],"d":[0.3,8.0],"l2d":[1.0,7.5]}},"3 kW":{"plein":{"n":[10.6753,-0.1369,-0.033],"n_max":40000,"fz":[-3.2035,0.7852,-0.2473],"ap":[-0.0379,0.379,-0.6714],"ae":[0.0,1.0,-0.0],"d":[0.3,10.0],"l2d":[1.0,7.5]},"partiel":{"n":[10.6753,-0.1369,-0.033],"n_max":40000,"fz":[-3.2516,0.8518,-0.423],"ap":[-0.3567,1.0975,1.1047],"ae":[-0.6944,0.5071,-1.043],"d":[0.3,10.0],"l2d":[1.0,7.5]}},"4 kW":{"plein":{"n":[10.6753,-0.1369,-0.033],"n_max":40000,"fz":[-3.1766,0.8133,-0.2614],"ap":[-0.0222,0.3778,-0.6841],"ae":[0.0,1.0,-0.0],"d":[0.3,10.0],"l2d":[1.0,7.5]},"partiel":{"n":[10.6753,-0.1369,-0.033],"n_max":40000,"fz":[-3.243,0.8681,-0.4232],"ap":[-0.3567,1.0975,1.1047],"ae":[-0.674,0.5351,-1.0487],"d":[0.3,10.0],"l2d":[1.0,7.5]}},"8 kW":{"plein":{"n":[10.5103,-0.0759,-0.0333],"n_max":34000,"fz":[-3.0605,0.7653,-0.2139],"ap":[-0.0046,0.4829,-0.5802],"ae":[0.0,1.0,0.0],"d":[0.3,12.0],"l2d":[1.0,7.5]},"partiel":{"n":[10.5103,-0.0759,-0.0333],"n_max":34000,"fz":[-3.1567,0.8021,-0.3485],"ap":[-0.352,1.0964,1.1014],"ae":[-0.549,0.5486,-0.99],"d":[0.3,12.0],"l2d":[1.0,7.5]}}};
  const BROCHES = Object.keys(MODEL);
  const MATIERES = {
    'alu': tr('Aluminium 200–400 N/mm² (référence du guide)'),
    'alu-tendre': tr('Aluminium < 200 N/mm² (rotation −20 %)'),
    'alu-dur': tr('Aluminium > 400 N/mm² (ap et ae −15 %)'),
    'autre': tr('Laiton, cuivre, bronze, plastique, bois (base aluminium, à valider par essai)')
  };
  const PAGES = { '1,8 kW': 20, '2 kW': 28, '2 kW neo': 36, '3 kW': 44, '4 kW': 52, '8 kW': 60 };   // 3 pages plein + 3 pages partiel
  const ev = (c, D, r) => Math.exp(c[0] + c[1] * Math.log(D) + c[2] * Math.log(r));
  const round = (v, d = 0) => { const k = 10 ** d; return Math.round(v * k) / k; };

  /* ---------- calcul par le modèle ---------- */
  function calc({ broche = '2 kW neo', strat = 'plein', D, L2, Z = 1, matiere = 'alu' }) {
    const m = (MODEL[broche] || MODEL['2 kW neo'])[strat];
    const notes = [], codes = [];
    D = +D; L2 = +L2 || 3 * D; Z = Math.max(1, +Z || 1);
    if (!(D > 0)) return null;
    if (D < m.d[0] || D > m.d[1]) { codes.push('plage'); notes.push(tr('Ø{d} hors de la plage du guide ({a}–{b} mm) : extrapolation.', { d: D, a: m.d[0], b: m.d[1] })); }
    const r = Math.min(Math.max(L2 / D, m.l2d[0]), m.l2d[1]);
    let n = Math.min(m.n_max, ev(m.n, D, r)), fz = ev(m.fz, D, r), ap = Math.min(ev(m.ap, D, r), L2), ae = Math.min(ev(m.ae, D, r), D);
    if (Z > 1) { codes.push('z'); notes.push(tr('Données établies pour des fraises 1 dent : avance calculée pour {z} dents, à valider.', { z: Z })); }
    if (matiere === 'alu-tendre') n *= 0.8;
    if (matiere === 'alu-dur') { ap *= 0.85; ae *= 0.85; }
    if (matiere === 'autre') codes.push('autre');
    if (matiere === 'autre') notes.push(tr('Le guide ne chiffre que l\'aluminium : valeurs de départ à valider par essai.'));
    if (D >= 5 && L2 > 4 * D) { n *= 0.8; fz *= 0.8; ap *= 0.8; ae *= 0.8; codes.push('vib'); notes.push(tr('Ø ≥ 5 et L2 > 4×Ø : paramètres réduits de 20 % (risque de vibrations).')); }
    const vf = n * fz * Z;
    return { n: round(n, -2), fz: round(fz, 4), vf: round(vf, -1), ap: round(ap, 2), ae: round(ae, 2), vc: round(Math.PI * D * n / 1000),
             q: round(ap * ae * vf / 1000, 2), source: 'modèle', notes, codes };
  }

  /* ---------- valeurs exactes : lecture locale du guide PDF ---------- */
  const ART = '(0[0-9]{3}\\d{3}[A-Z])';
  let guide = null;                                   // { ref: { D1, D2, L1, L2, rows: [{broche, strat, D, z, vc, n, fz, vf, ap, ae}] } }
  try { const s = window.Stockage && window.Stockage.actif() && window.Stockage.get('coupe'); if (s && s.refs) guide = s.refs; } catch (e) { /* */ }

  function chargerPdfjs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    return new Promise((ok, ko) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; ok(window.pdfjsLib); };
      s.onerror = () => ko(new Error(tr('pdf.js indisponible')));
      document.head.append(s);
    });
  }
  async function chargerGuide(file, progress = () => {}) {
    const lib = await chargerPdfjs();
    const pdf = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
    const texte = async p => (await (await pdf.getPage(p)).getTextContent()).items.map(i => i.str).join(' ').replace(/\s+/g, ' ');
    const refs = {};
    for (let p = 12; p <= 18; p++) {                                   // cotes des outils
      progress(tr('Cotes des outils, page {p}…', { p }));
      const t = await texte(p);
      for (const m of t.matchAll(new RegExp(ART + '((?:\\s+\\d+\\.\\d+)+)', 'g'))) {
        const v = m[2].trim().split(/\s+/).map(Number); if (v.length < 4) continue;
        let rest = v.slice(2); if (rest.length >= 3 && rest[0] < v[1]) rest = rest.slice(1);
        refs[m[1]] = refs[m[1]] || { D1: v[0], D2: v[1], L1: rest[0], L2: rest[1], rows: [] };
      }
    }
    const f = s => parseFloat(s.replace(',', '.'));
    const row = new RegExp(ART + '\\s+(\\d+(?:,\\d+)?)\\s+([1-4])\\s+(\\d{2,4})\\s+(\\d{4,5})\\s+(0,\\d{2,4})\\s+(\\d{2,5})\\s+(\\d{1,2},\\d{1,2})\\s+(\\d{1,2},\\d{1,2})', 'g');
    for (const [broche, p0] of Object.entries(PAGES)) {
      for (let k = 0; k < 6; k++) {
        progress(tr('Données de coupe {b}, page {p}…', { b: broche, p: p0 + k }));
        const t = await texte(p0 + k);
        for (const m of t.matchAll(row)) {
          const ref = refs[m[1]] = refs[m[1]] || { D1: f(m[2]), rows: [] };
          ref.rows.push({ broche, strat: k < 3 ? 'plein' : 'partiel', D: f(m[2]), z: +m[3], vc: f(m[4]), n: f(m[5]), fz: f(m[6]), vf: f(m[7]), ap: f(m[8]), ae: f(m[9]) });
        }
      }
    }
    const nb = Object.values(refs).filter(r => r.rows.length).length;
    if (!nb) throw new Error(tr('aucun tableau reconnu : est-ce bien le « DATRON High-Speed Cutting Guide » ?'));
    guide = refs;
    if (window.Stockage && window.Stockage.actif()) window.Stockage.set('coupe', { date: new Date().toISOString(), refs });
    return nb;
  }
  const exact = ref => (guide && ref && guide[String(ref).toUpperCase()]) || null;

  /* ---------- proposition pour un outil de tools.json ---------- */
  function proposer(outil, { broche = '2 kW neo', matiere = 'alu' } = {}) {
    const t = outil;
    if (t.type !== 'fraise') return { ok: false, raison: tr('Le guide DATRON ne concerne que les fraises (1 dent).') };
    const ex = exact(t.articleNr);
    const pick = strat => {
      const r = ex && ex.rows.find(x => x.broche === broche && x.strat === strat);
      if (r) {
        const res = { n: r.n, fz: r.fz, vf: r.vf, ap: r.ap, ae: r.ae, vc: r.vc, source: 'guide', notes: [] };
        if (matiere === 'alu-tendre') { res.n = round(r.n * 0.8, -2); res.vf = round(r.vf * 0.8, -1); }
        if (matiere === 'alu-dur') { res.ap = round(r.ap * 0.85, 2); res.ae = round(r.ae * 0.85, 2); }
        return res;
      }
      return calc({ broche, strat, D: t.diameter, L2: t.fluteLength || (ex && ex.L2), Z: t.flutes, matiere });
    };
    const plein = pick('plein'), partiel = pick('partiel');
    if (!plein || !partiel) return { ok: false, raison: tr('Diamètre de l\'outil manquant.') };
    const roughing = plein.vf, finishing = partiel.vf;
    return {
      ok: true, source: plein.source === 'guide' ? tr('guide DATRON (réf. {r})', { r: t.articleNr }) : tr('modèle d\'après le guide DATRON'),
      rpm: plein.n,
      feeds: { roughing, finishing, plunge: round(roughing * 0.25, -1), ramp: roughing },
      coupe: { broche, matiere, source: plein.source, rainurage: { ap: plein.ap, ae: plein.ae, vf: plein.vf }, lateral: { ap: partiel.ap, ae: partiel.ae, vf: partiel.vf } },
      notes: [...new Set([...plein.notes, ...partiel.notes, tr('Plongée = 25 % de l\'ébauche et rampe = ébauche : estimations (le guide préconise une rampe de 3–5°).')])]
    };
  }

  window.Coupe = { MODEL, BROCHES, MATIERES, GUIDE_URL, calc, chargerGuide, exact, proposer, guideCharge: () => !!guide,
                   nbRefs: () => (guide ? Object.values(guide).filter(r => r.rows.length).length : 0) };
})();
