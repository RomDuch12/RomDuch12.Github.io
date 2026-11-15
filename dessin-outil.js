/* Dessin d'un outil à partir de ses cotes (portage web du générateur de NeoDrive) :
   - cotes()  : les cotes D1 D2 D3 L1 L2 L3, angle, R… depuis la fiche de l'outil, le catalogue DATRON et le nom ;
   - profil() : le demi-profil de révolution (r, z), de la pointe (z = 0) à la queue (z = L1) ;
   - step()   : le solide de révolution exact en STEP AP214 (plans, cylindres, cônes), partie coupante en or ;
   - dxf()    : l'outil debout, pointe en bas, coté (silhouette, partie coupante, axe, cotes, cartouche, demi-profil) ;
   - svg()    : le même plan, pour l'affichage.
   Sans DOM : utilisable dans le navigateur et dans les tests. */
(function (root) {
  'use strict';
  const EPS_POINTE = 0.01;          // rayon mini d'une pointe : un cône pointu finit sur un tout petit plat
  const N_ARC = 8;                  // segments d'un quart d'arc
  const FAMILLES = ['fraise', 'surfacage', 'torique', 'boule', 'foret', 'conique', 'chanfrein', 'rayon', 'filetage', 'tslot'];
  const n = (v, d = 0) => (Number.isFinite(+v) && v !== null && v !== '' ? +v : d);
  const g = v => String(+(+v).toFixed(4));

  /* ───────── les cotes ───────── */
  // type du site → famille du dessin
  const FAMILLE_DE = { fraise: 'fraise', surfacage: 'surfacage', boule: 'boule', torique: 'torique', gravure: 'conique', foret: 'foret',
    filetage: 'filetage', chanfrein: 'chanfrein', rayon: 'rayon', tslot: 'tslot' };
  const estPointe = x => x.categorie === 'conique' && String(x.famille || '').startsWith('Pointe');
  const longueurUtile = x => { for (const k of ['L3', 'longueur_utile', 'L2']) if (x[k]) return +x[k]; return undefined; };
  /* la fiche que le catalogue permet de remplir (rien n'est inventé) */
  function geometrieCatalogue(x) {
    const G = {}, mettre = (k, v, conv = Number) => { if (v === undefined || v === null || v === '') return; const y = conv(v); if (Number.isFinite(y)) G[k] = y; };
    const cat = x.categorie;
    if (cat === 'conique') { if (estPointe(x)) { mettre('Diameter', x.D2); mettre('TipDiameter', x.D1); } else mettre('Diameter', x.D1); mettre('TipAngle', x.angle); }
    else if (cat === 'chanfrein' || cat === 'rayon') {
      mettre('Diameter', x.D3 || x.D1);
      if (cat === 'chanfrein') { mettre('TipAngle', x.angle); if (x.D3) mettre('TipDiameter', x.D1); } else mettre('CornerRadius', x.R);
    } else {
      mettre('Diameter', x.D1);
      if (cat === 'foret') mettre('TipAngle', x.angle);
      if (cat === 'boule') mettre('CornerRadius', x.R ? x.R : (x.D1 ? x.D1 / 2 : undefined));
      else if (cat === 'torique' || cat === 'surfacage') mettre('CornerRadius', x.R);
      mettre('ShoulderDiameter', x.D3);                // D3 : Ø de dégagement (col), L3 sa longueur
    }
    mettre('FluteLength', x.L2); mettre('ShoulderLength', longueurUtile(x)); mettre('NumberOfFlutes', x.dents, Math.round);
    mettre('ShaftDiameter', x.D2); mettre('OverallLength', x.L1); mettre('ThreadPitch', x.pas);
    return G;
  }
  /* ce que le nom d'atelier dit de l'outil : « Cyl 2 z1L4 », « Con 30° 0.6 », « Foret Ø4.2 L21 », « Chamfer 90° z3L3 » */
  function geometrieNom(nom) {
    const s = String(nom || '').normalize('NFKD').replace(/[^\x00-\x7f]/g, '').replace(/,/g, '.').toLowerCase(), N = '(\\d+(?:\\.\\d+)?)', G = {};
    let m;
    if ((m = s.match(new RegExp('\\bcyl\\s*' + N)))) { G.Diameter = +m[1]; G.TipAngle = 0; G.TipDiameter = +m[1]; }
    if ((m = s.match(new RegExp('\\bcon\\s*' + N + '\\s*' + N + '?'))) && G.Diameter === undefined) { G.TipAngle = +m[1]; if (m[2]) G.TipDiameter = +m[2]; }
    if ((m = s.match(new RegExp('\\b(?:foret|drill)\\s*(?:o|d)?\\s*' + N))) && G.Diameter === undefined) G.Diameter = +m[1];
    if ((m = s.match(new RegExp('\\b(?:chamfer|cham|chanfrein)\\s*' + N))) && G.TipAngle === undefined) G.TipAngle = +m[1];
    if ((m = s.match(new RegExp('\\b(?:extrad|t-?slot)\\s*' + N))) && G.Diameter === undefined) G.Diameter = +m[1];
    if ((m = s.match(/\bz\s*(\d+)/))) G.NumberOfFlutes = +m[1];
    if ((m = s.match(new RegExp('\\bz\\d+\\s*l' + N + '|(?<![a-z])l\\s*' + N + '\\b')))) G.ShoulderLength = +(m[1] || m[2]);
    if ((m = s.match(new RegExp('\\br' + N + '\\b'))) && s.includes('extrad')) G.CornerRadius = +m[1];
    return G;
  }
  /* fiche @ ToolDescription @ d'un outil du site (les champs vides ne disent rien) */
  function ficheSite(o) {
    const G = {}, M = { Diameter: 'diameter', TipDiameter: 'tipDiameter', TipAngle: 'tipAngle', CornerRadius: 'radius', FluteLength: 'fluteLength',
      NumberOfFlutes: 'flutes', ThreadPitch: 'pitch', ShaftDiameter: 'shankDiameter', OverallLength: 'overallLength', ShoulderDiameter: 'neckDiameter', ShoulderLength: 'neckLength' };
    for (const [k, s] of Object.entries(M)) if (o[s] !== undefined && o[s] !== null && o[s] !== '' && Number.isFinite(+o[s])) G[k] = +o[s];
    if (o.type !== 'gravure' && o.type !== 'chanfrein' && G.TipDiameter === G.Diameter) delete G.TipDiameter;   // « Cyl 3 » : pointe = Ø
    if (!G.TipAngle) delete G.TipAngle;
    return G;
  }
  /* o : outil du site (type, diameter…) ou fiche brute ({ geometry, name }) ; e : entrée du catalogue DATRON (facultative) */
  function cotes(o, e) {
    o = o || {};
    const nom = String(o.name || ''), fiche = o.geometry ? { ...o.geometry } : ficheSite(o), sources = [];
    Object.keys(fiche).forEach(k => { if (fiche[k] === '' || fiche[k] === null || fiche[k] === undefined) delete fiche[k]; });
    if (Object.keys(fiche).length) sources.push("fiche de l'outil");
    let famille = e ? e.categorie || '' : '', libelle = e ? e.famille || '' : '';
    const G = { ...fiche };
    if (e) {
      const apport = Object.entries(geometrieCatalogue(e)).filter(([k]) => !(k in G));
      if (apport.length) { sources.push(`catalogue DATRON (${e.ref || o.articleNr || ''})`); apport.forEach(([k, v]) => { G[k] = v; }); }
    }
    const duNom = Object.entries(geometrieNom(nom)).filter(([k]) => !(k in G));
    if (duNom.length) { sources.push("nom de l'outil"); duNom.forEach(([k, v]) => { G[k] = v; }); }
    const nm = nom.toLowerCase();
    if (!famille) famille = FAMILLE_DE[o.type] || '';
    if (!famille) {
      if (/^(t-slot|tslot|t slot)/.test(nm)) famille = 'tslot';
      else if (/^(thr|m\d)/.test(nm)) famille = 'filetage';
      else if (/^(boule|ball)/.test(nm)) famille = 'boule';
      else if (/^foret|^drill/.test(nm)) famille = 'foret';
      else if (/^(cham|chanf)/.test(nm)) famille = 'chanfrein';
      else if (/^con/.test(nm)) famille = 'conique';
      else if (/^extrad/.test(nm)) famille = 'rayon';
      else if (n(G.CornerRadius) > 0) famille = 'torique';
      else famille = 'fraise';
    }
    if (/^(t-slot|tslot|t slot)/.test(nm)) famille = 'tslot';
    const c = { famille, libelle: libelle || famille, source: sources.join(' + ') || "valeurs d'atelier par défaut" };
    const D = n(G.Diameter) || n(o.diameter), pointe = n(G.TipDiameter), R = n(G.CornerRadius);
    // pointe à graver : sa POINTE est D1, le Ø de la fiche est celui de la queue
    const gravure = famille === 'conique' && pointe > 0 && (!D || pointe < D - 1e-9);
    const D1 = gravure ? pointe : famille === 'rayon' ? Math.max(EPS_POINTE * 2, (D || 6) - 2 * R) : D;
    Object.assign(c, { gravure, D1, D2: n(G.ShaftDiameter) || (gravure ? D : 0), D3: n(G.ShoulderDiameter), L1: n(G.OverallLength), L2: n(G.FluteLength),
      L3: n(G.ShoulderLength), angle: n(G.TipAngle), R });
    if (famille === 'filetage') c.angle = n(G.ThreadAngle) || c.angle || (e ? n(e.angle) : 0);
    c.pointe = (!gravure && pointe > 0 && pointe < D1) ? pointe : 0;     // troncature d'un cône (chanfrein, V)
    c.dents = Math.round(n(G.NumberOfFlutes)); c.pas = n(G.ThreadPitch);
    const h = nm.match(/\bh\s*([0-9]+(?:[.,][0-9]+)?)/); c.hauteur = h ? +h[1].replace(',', '.') : 0;
    if (famille === 'tslot' && !c.hauteur && c.L2 > 0 && c.L2 < 0.6 * (c.D1 || 1)) c.hauteur = c.L2;
    // ce qui manque : les valeurs d'atelier courantes
    if (!c.D1) c.D1 = 3;
    if (!c.D2) c.D2 = c.D1 <= 6 ? 6 : c.D1 <= 8 ? 8 : 10;
    if (famille === 'tslot') c.D2 = c.D2 < c.D1 ? c.D2 : Math.min(6, 0.75 * c.D1);
    if (!c.L2) c.L2 = c.L3 ? Math.min(c.L3, 3 * c.D1) : Math.max(1, 2 * c.D1);
    if (!c.L1) c.L1 = Math.max(40, c.L3 + 15, c.L2 + 20);
    return c;
  }

  /* ───────── le profil ───────── */
  function Trace() {
    const pts = [];
    const P = {
      pts,
      get r() { return pts[pts.length - 1][0]; },
      get z() { return pts[pts.length - 1][1]; },
      vers(r, z) {
        r = Math.max(EPS_POINTE, +r); z = +z;
        if (pts.length) { const [r0, z0] = pts[pts.length - 1]; z = Math.max(z, z0); if (Math.abs(r - r0) < 1e-6 && Math.abs(z - z0) < 1e-6) return; }
        pts.push([r, z]);
      },
      arc(cr, cz, R, a0, a1, k = N_ARC) { for (let i = 1; i <= k; i++) { const a = (a0 + (a1 - a0) * i / k) * Math.PI / 180; P.vers(cr + R * Math.cos(a), cz + R * Math.sin(a)); } },
      passerA(rc, zMini) {                                        // raccord à 45° vers un autre rayon
        if (zMini !== undefined && zMini > P.z) P.vers(P.r, zMini);
        if (Math.abs(rc - P.r) > 1e-6) P.vers(rc, P.z + Math.abs(rc - P.r));
      }
    };
    return P;
  }
  function nettoyer(pts, zGarde = null) {
    const s = [];
    for (const [r, z] of pts) { if (s.length && Math.abs(s[s.length - 1][0] - r) < 1e-6 && Math.abs(s[s.length - 1][1] - z) < 1e-6) continue; s.push([r, z]); }
    let k = 1;
    while (k < s.length - 1) {
      const [ra, za] = s[k - 1], [rb, zb] = s[k], [rc, zc] = s[k + 1];
      const alignes = Math.abs((rb - ra) * (zc - za) - (zb - za) * (rc - ra)) < 1e-9, deuxPlats = Math.abs(za - zb) < 1e-9 && Math.abs(zb - zc) < 1e-9;
      const garde = zGarde !== null && Math.abs(zb - zGarde) < 1e-9 && !deuxPlats;      // la limite de la partie coupante reste un sommet
      if ((alignes || deuxPlats) && !garde) { s.splice(k, 1); continue; }
      k++;
    }
    return s;
  }
  const rad = d => d * Math.PI / 180;
  function profil(c) {
    const fam = c.famille, r1 = c.D1 / 2, r2 = c.D2 / 2, r3 = c.D3 / 2, { L1, L2, L3, R, angle } = c, p = Trace();
    let zCoupe = L2;
    const colEtQueue = () => {                                     // après la coupe : le col (D3 jusqu'à L3), puis la queue
      if (r3 > 0 && L3 > p.z + 1e-6) { if (r3 < p.r) p.vers(r3, p.z); else p.passerA(r3); p.vers(r3, L3); }
      else if (L3 > p.z + 1e-6 && fam !== 'surfacage') p.vers(p.r, L3);
      p.passerA(r2); p.vers(r2, Math.max(L1, p.z + 1));
    };
    const queue = () => { p.passerA(r2); p.vers(r2, Math.max(L1, p.z + 1)); };
    if (fam === 'fraise' || fam === 'surfacage' || fam === 'torique') {
      if (R > 0 && R < r1) { p.vers(r1 - R, 0); p.arc(r1 - R, R, R, -90, 0); } else p.vers(r1, 0);
      p.vers(r1, Math.max(L2, p.z)); colEtQueue();
    } else if (fam === 'boule') {
      const Rb = Math.min(R || r1, r1);
      p.vers(EPS_POINTE, 0); p.arc(0, Rb, Rb, -90, 0); if (r1 > Rb) p.vers(r1, Rb);
      p.vers(r1, Math.max(L2, p.z)); colEtQueue();
    } else if (fam === 'foret') {
      const a = rad(Math.max(60, Math.min(179, angle || 118)) / 2);
      p.vers(EPS_POINTE, 0); p.vers(r1, r1 / Math.tan(a)); p.vers(r1, Math.max(L2, p.z)); queue();
    } else if (fam === 'conique') {
      const a = rad(Math.max(5, Math.min(170, angle || 30)) / 2);
      if (c.gravure || r1 < 0.3 * r2 || !L2 || /grav/i.test(c.libelle || '')) {     // pointe à graver : le cône monte à la queue
        const rp = Math.max(EPS_POINTE, r1);
        p.vers(rp, 0); p.vers(r2, (r2 - rp) / Math.tan(a)); zCoupe = p.z; p.vers(r2, Math.max(L1, p.z + 1));
      } else {                                                     // fraise pour rainure en V : D1 en haut du cône
        const rp = Math.max(EPS_POINTE, c.pointe / 2);
        p.vers(rp, 0); p.vers(r1, (r1 - rp) / Math.tan(a)); p.vers(r1, Math.max(L2, p.z)); queue();
      }
    } else if (fam === 'chanfrein') {
      const a = rad(Math.max(5, Math.min(170, angle || 90)) / 2);
      let rp = (c.pointe > 0 && c.pointe < c.D1) ? c.pointe / 2 : (L2 ? r1 - L2 * Math.tan(a) : 0);
      rp = Math.max(EPS_POINTE, rp);
      p.vers(rp, 0); p.vers(r1, (r1 - rp) / Math.tan(a)); zCoupe = p.z; queue();
    } else if (fam === 'rayon') {                                  // quart de cercle creux, de la pointe au Ø
      const Rr = R || 1;
      p.vers(r1, 0); p.arc(r1 + Rr, 0, Rr, 180, 90); zCoupe = p.z;
      if (L2 > p.z) p.vers(p.r, L2);
      colEtQueue();
    } else if (fam === 'filetage') {
      const rc = (r3 > 0 && r3 < r1) ? r3 : 0.7 * r1, a = rad(Math.max(20, Math.min(120, angle || 60)) / 2), t = (r1 - rc) * Math.tan(a), h = Math.max(L2, 2 * t);
      p.vers(rc, 0); p.vers(r1, t); if (h > 2 * t + 1e-6) p.vers(r1, h - t); p.vers(rc, h); zCoupe = h;
      if (L3 > p.z) p.vers(rc, L3);
      queue();
    } else if (fam === 'tslot') {
      const h = c.hauteur || Math.max(0.5, 0.2 * c.D1), rc = 0.45 * r1, portee = L3 || L2 || 3 * c.D1;
      p.vers(r1, 0); p.vers(r1, h); p.vers(rc, h); zCoupe = h; p.vers(rc, Math.max(portee, h + 1)); queue();
    } else { p.vers(r1, 0); p.vers(r1, Math.max(L2, 1)); colEtQueue(); }
    const points = nettoyer(p.pts), zc = Math.min(zCoupe, points[points.length - 1][1]);
    // un sommet à la limite de la partie coupante, s'il tombe au milieu d'un segment : la face se coupe en deux (or / gris)
    const k = points.findIndex(([, z], i) => i > 0 && z > zc + 1e-9 && points[i - 1][1] < zc - 1e-9);
    if (k > 0) { const [ra, za] = points[k - 1], [rb, zb] = points[k]; points.splice(k, 0, [ra + (rb - ra) * (zc - za) / (zb - za), zc]); }
    return { points, zCoupe: zc };
  }

  /* ───────── le STEP ───────── */
  const ascii = s => String(s ?? '').normalize('NFKD').split('').filter(ch => ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) < 127 && ch !== "'").join('');
  const sf = v => { v = +v; if (Math.abs(v) < 1e-12) return '0.'; return v.toFixed(9).replace(/0+$/, ''); };
  function step(points, nom = 'outil', zCoupe = null, reference = '', date = new Date()) {
    const pts = nettoyer(points.map(([r, z]) => [Math.max(EPS_POINTE, r), z]), zCoupe), L = [];
    const e = t => { L.push(t); return `#${L.length}`; };
    const pt = (x, y, z) => e(`CARTESIAN_POINT('',(${sf(x)},${sf(y)},${sf(z)}))`);
    const dr = (x, y, z) => e(`DIRECTION('',(${sf(x)},${sf(y)},${sf(z)}))`);
    const axe = (z, sens = 1) => e(`AXIS2_PLACEMENT_3D('',${pt(0, 0, z)},${dr(0, 0, sens)},${dr(1, 0, 0)})`);
    const nomA = ascii(nom) || 'outil';
    const ctx = e("APPLICATION_CONTEXT('core data for automotive mechanical design processes')");
    e(`APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,${ctx})`);
    const pctx = e(`PRODUCT_CONTEXT('',${ctx},'mechanical')`);
    const produit = e(`PRODUCT('${ascii(reference) || nomA}','${nomA}','',(${pctx}))`);
    e(`PRODUCT_RELATED_PRODUCT_CATEGORY('part',$,(${produit}))`);
    const pdf = e(`PRODUCT_DEFINITION_FORMATION('','',${produit})`);
    const pdc = e(`PRODUCT_DEFINITION_CONTEXT('part definition',${ctx},'design')`);
    const pd = e(`PRODUCT_DEFINITION('design','',${pdf},${pdc})`);
    const pds = e(`PRODUCT_DEFINITION_SHAPE('','',${pd})`);
    const lg = e('(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.))');
    const an = e('(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.))');
    const so = e('(NAMED_UNIT(*)SI_UNIT($,.STERADIAN.)SOLID_ANGLE_UNIT())');
    const unc = e(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-07),${lg},'distance_accuracy_value','confusion accuracy')`);
    const rctx = e(`(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((${unc}))GLOBAL_UNIT_ASSIGNED_CONTEXT((${lg},${an},${so}))REPRESENTATION_CONTEXT('Context #1','3D Context with UNIT and UNCERTAINTY'))`);
    const sommets = [], cercles = [];                               // un cercle (et son sommet) par point du profil
    for (const [r, z] of pts) {
      const v = e(`VERTEX_POINT('',${pt(r, 0, z)})`), c = e(`CIRCLE('',${axe(z)},${sf(r)})`);
      cercles.push(e(`EDGE_CURVE('',${v},${v},${c},.T.)`)); sommets.push(v);
    }
    const oe = (a, s) => e(`ORIENTED_EDGE('',*,*,${a},${s ? '.T.' : '.F.'})`);
    const boucle = a => e(`EDGE_LOOP('',(${a.join(',')}))`);
    const faces = [];                                               // [face, partie coupante]
    let surf = e(`PLANE('',${axe(pts[0][1], -1)})`), b = e(`FACE_OUTER_BOUND('',${boucle([oe(cercles[0], false)])},.T.)`);
    faces.push([e(`ADVANCED_FACE('',(${b}),${surf},.T.)`), true]);  // disque du bas (vers −Z)
    for (let i = 0; i < pts.length - 1; i++) {
      const [ra, za] = pts[i], [rb, zb] = pts[i + 1], coupe = (za + zb) / 2 <= (zCoupe ?? -1) + 1e-9;
      if (Math.abs(zb - za) < 1e-9) {                               // épaulement : couronne plane
        let ext, inte;
        if (rb < ra) { surf = e(`PLANE('',${axe(za, 1)})`); ext = e(`FACE_OUTER_BOUND('',${boucle([oe(cercles[i], true)])},.T.)`); inte = e(`FACE_BOUND('',${boucle([oe(cercles[i + 1], false)])},.T.)`); }
        else { surf = e(`PLANE('',${axe(za, -1)})`); ext = e(`FACE_OUTER_BOUND('',${boucle([oe(cercles[i + 1], false)])},.T.)`); inte = e(`FACE_BOUND('',${boucle([oe(cercles[i], true)])},.T.)`); }
        faces.push([e(`ADVANCED_FACE('',(${ext},${inte}),${surf},.T.)`), coupe]);
        continue;
      }
      if (Math.abs(rb - ra) < 1e-9) surf = e(`CYLINDRICAL_SURFACE('',${axe(za)},${sf(ra)})`);
      else surf = e(`CONICAL_SURFACE('',${axe(za, rb > ra ? 1 : -1)},${sf(ra)},${sf(Math.atan(Math.abs(rb - ra) / (zb - za)))})`);
      const dx = rb - ra, dz = zb - za, l = Math.hypot(dx, dz);
      const ligne = e(`LINE('',${pt(ra, 0, za)},${e(`VECTOR('',${dr(dx / l, 0, dz / l)},${sf(l)})`)})`);   // VECTOR en entité : pas d'instance en ligne en Part 21
      const couture = e(`EDGE_CURVE('',${sommets[i]},${sommets[i + 1]},${ligne},.T.)`);
      b = e(`FACE_OUTER_BOUND('',${boucle([oe(cercles[i], true), oe(couture, true), oe(cercles[i + 1], false), oe(couture, false)])},.T.)`);
      faces.push([e(`ADVANCED_FACE('',(${b}),${surf},.T.)`), coupe]);
    }
    surf = e(`PLANE('',${axe(pts[pts.length - 1][1], 1)})`);       // disque du haut (vers +Z)
    b = e(`FACE_OUTER_BOUND('',${boucle([oe(cercles[cercles.length - 1], true)])},.T.)`);
    faces.push([e(`ADVANCED_FACE('',(${b}),${surf},.T.)`), false]);
    const coque = e(`CLOSED_SHELL('',(${faces.map(f => f[0]).join(',')}))`);
    const brep = e(`MANIFOLD_SOLID_BREP('${nomA}',${coque})`);
    const absr = e(`ADVANCED_BREP_SHAPE_REPRESENTATION('',(${brep},${axe(0)}),${rctx})`);
    e(`SHAPE_DEFINITION_REPRESENTATION(${pds},${absr})`);
    const styles = [['coupe', [0.85, 0.68, 0.25]], ['corps', [0.62, 0.64, 0.68]]].map(([teinte, [r, gg, bb]]) => {
      const col = e(`COLOUR_RGB('${teinte}',${sf(r)},${sf(gg)},${sf(bb)})`), fsc = e(`FILL_AREA_STYLE_COLOUR('',${col})`), fas = e(`FILL_AREA_STYLE('',(${fsc}))`);
      const ssfa = e(`SURFACE_STYLE_FILL_AREA(${fas})`), sss = e(`SURFACE_SIDE_STYLE('',(${ssfa}))`), ssu = e(`SURFACE_STYLE_USAGE(.BOTH.,${sss})`);
      return e(`PRESENTATION_STYLE_ASSIGNMENT((${ssu}))`);
    });
    const items = faces.map(([f, c]) => e(`STYLED_ITEM('',(${c ? styles[0] : styles[1]}),${f})`));
    e(`MECHANICAL_DESIGN_GEOMETRIC_PRESENTATION_REPRESENTATION('',(${items.join(',')}),${rctx})`);
    const quand = new Date(date).toISOString().slice(0, 19);
    return ['ISO-10303-21;', 'HEADER;', "FILE_DESCRIPTION(('RomDuch - outil dessine depuis ses cotes'),'2;1');",
      `FILE_NAME('${nomA}.step','${quand}',('RomDuch'),(''),'RomDuch','RomDuch','');`,
      "FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));", 'ENDSEC;', 'DATA;',
      ...L.map((l, k) => `#${k + 1}=${l};`), 'ENDSEC;', 'END-ISO-10303-21;', ''].join('\n');
  }

  /* ───────── le plan (commun au DXF et au SVG) ───────── */
  // primitives : { polys: [{ pts, layer, closed }], lines: [{ a, b, layer }], solids: [{ pts, layer }], texts: [{ x, y, h, txt, layer, rot, align }] }
  const CALQUES = { CONTOUR: 7, COUPE: 2, AXE: 1, COTES: 3, TEXTE: 7, PROFIL: 4 };
  function plan(points, c, nom = 'outil', zCoupe = null, reference = '', cartouche = 'droite') {
    const pts = points.map(([r, z]) => [Math.max(0, r), z]), L1 = pts[pts.length - 1][1], zc = zCoupe ?? 0;
    const P = { polys: [], lines: [], solids: [], texts: [], hauteur: 0 };
    P.polys.push({ pts: [...pts, ...pts.slice().reverse().map(([r, z]) => [-r, z])], layer: 'CONTOUR', closed: true });
    for (const s of [1, -1]) { const seg = pts.filter(([, z]) => z <= zc + 1e-9).map(([r, z]) => [s * r, z]); if (seg.length >= 2) P.polys.push({ pts: seg, layer: 'COUPE' }); }
    if (zc > 0) { const rc = Math.max(0, ...pts.filter(([, z]) => z <= zc + 1e-9).map(([r]) => r)); P.lines.push({ a: [-rc, zc], b: [rc, zc], layer: 'COUPE' }); }
    P.lines.push({ a: [0, -2], b: [0, L1 + 2], layer: 'AXE' });
    P.polys.push({ pts: [[0, pts[0][1]], ...pts, [0, L1]], layer: 'PROFIL', closed: true });
    const h = Math.max(0.8, Math.min(3, L1 / 30)), asz = h * 0.8, exe = h * 0.4, exo = h * 0.3; P.hauteur = h;
    const rmax = Math.max(...pts.map(([r]) => r));
    const fleche = (x, y, ux, uy) => P.solids.push({ pts: [[x, y], [x + ux * asz - uy * asz / 6, y + uy * asz + ux * asz / 6], [x + ux * asz + uy * asz / 6, y + uy * asz - ux * asz / 6]], layer: 'COTES' });
    const coteH = (r, z, txt) => {                                  // cote horizontale d'un Ø, à travers l'outil
      if (r <= 0) return;
      P.lines.push({ a: [-r, z], b: [r, z], layer: 'COTES' }); fleche(-r, z, 1, 0); fleche(r, z, -1, 0);
      P.texts.push({ x: 0, y: z + h * 0.35, h, txt, layer: 'COTES', align: 'center' });
    };
    const coteV = (z0, z1, x, txt) => {                             // cote verticale d'une longueur, à droite
      if (z1 - z0 <= 1e-6) return;
      P.lines.push({ a: [rmax + exo, z0], b: [x + exe, z0], layer: 'COTES' }, { a: [rmax + exo, z1], b: [x + exe, z1], layer: 'COTES' }, { a: [x, z0], b: [x, z1], layer: 'COTES' });
      fleche(x, z0, 0, 1); fleche(x, z1, 0, -1);
      P.texts.push({ x: x - h * 0.35, y: (z0 + z1) / 2, h, txt, layer: 'COTES', align: 'center', rot: 90 });
    };
    const D1 = c.D1 || 0, D2 = c.D2 || 0, L3 = c.L3 || 0;
    const rCoupe = Math.max(...pts.filter(([, z]) => z <= Math.max(zc, 1e-6) + 1e-9).map(([r]) => r), D1 / 2 * 0);
    coteH(rCoupe || D1 / 2, Math.max(zc, 0) * 0.5, `%%c${g(D1)}`);
    const zQueue = (pts[pts.length - 1][1] + Math.max(...pts.slice(0, -1).map(([, z]) => z))) / 2;
    coteH(pts[pts.length - 1][0], zQueue, `%%c${g(D2)}`);
    const pas = 3 * h;
    coteV(0, L1, rmax + 4 * pas, g(L1));
    if (zc > 0) coteV(0, zc, rmax + 2 * pas, g(zc));
    if (L3 && L3 > zc + 1e-6 && L3 < L1 - 1e-6) coteV(0, L3, rmax + 3 * pas, g(L3));
    const notes = [];
    if (c.angle) notes.push(`${g(c.angle)}%%d`);
    if (c.R) notes.push(`R${g(c.R)}`);
    if (notes.length) P.texts.push({ x: rmax + h, y: -h * 1.5, h, txt: notes.join(' '), layer: 'COTES' });
    const lignes = [nom, reference ? `Ref. ${reference}` : '', c.libelle || '',
      `D1 ${g(D1)}  D2 ${g(D2)}${c.D3 ? `  D3 ${g(c.D3)}` : ''}`, `L1 ${g(L1)}  L2 ${g(c.L2 || 0)}${L3 ? `  L3 ${g(L3)}` : ''}`,
      c.dents ? `${c.dents} dent(s)` : '', `Source: ${c.source || ''}`].filter(Boolean);
    // le cartouche : à droite (DXF, comme NeoDrive bureau) ou sous l'outil (affichage en hauteur)
    let y = cartouche === 'bas' ? -h * 4.5 : L1;
    for (const l of lignes) { P.texts.push({ x: cartouche === 'bas' ? -rmax : rmax + 7 * pas, y, h, txt: l, layer: 'TEXTE' }); y -= h * 1.6; }
    return P;
  }

  /* ───────── le DXF (R12, lisible partout) ───────── */
  function dxf(points, c, nom = 'outil', zCoupe = null, reference = '') {
    const P = plan(points, c, nom, zCoupe, reference), o = [], f = v => (+v).toFixed(6).replace(/\.?0+$/, '') || '0';
    const asc = s => ascii(s).replace(/[\r\n]/g, ' ');
    o.push('0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC');
    o.push('0', 'SECTION', '2', 'TABLES',
      '0', 'TABLE', '2', 'LTYPE', '70', '2',
      '0', 'LTYPE', '2', 'CONTINUOUS', '70', '0', '3', 'Solid line', '72', '65', '73', '0', '40', '0',
      '0', 'LTYPE', '2', 'CENTER', '70', '0', '3', 'Center ____ _ ____ _', '72', '65', '73', '4', '40', '20', '49', '12', '49', '-3', '49', '2', '49', '-3',
      '0', 'ENDTAB', '0', 'TABLE', '2', 'LAYER', '70', String(Object.keys(CALQUES).length));
    for (const [k, col] of Object.entries(CALQUES)) o.push('0', 'LAYER', '2', k, '70', '0', '62', String(k === 'PROFIL' ? -col : col), '6', k === 'AXE' ? 'CENTER' : 'CONTINUOUS');
    o.push('0', 'ENDTAB', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES');
    for (const p of P.polys) {
      o.push('0', 'POLYLINE', '8', p.layer, '66', '1', '10', '0', '20', '0', '30', '0', '70', p.closed ? '1' : '0');
      for (const [x, y] of p.pts) o.push('0', 'VERTEX', '8', p.layer, '10', f(x), '20', f(y), '30', '0');
      o.push('0', 'SEQEND', '8', p.layer);
    }
    for (const l of P.lines) o.push('0', 'LINE', '8', l.layer, '10', f(l.a[0]), '20', f(l.a[1]), '30', '0', '11', f(l.b[0]), '21', f(l.b[1]), '31', '0');
    for (const s of P.solids) { const [a, b, d] = s.pts; o.push('0', 'SOLID', '8', s.layer, '10', f(a[0]), '20', f(a[1]), '30', '0', '11', f(b[0]), '21', f(b[1]), '31', '0', '12', f(d[0]), '22', f(d[1]), '32', '0', '13', f(d[0]), '23', f(d[1]), '33', '0'); }
    for (const t of P.texts) {
      o.push('0', 'TEXT', '8', t.layer, '10', f(t.x), '20', f(t.y), '30', '0', '40', f(t.h), '1', asc(t.txt));
      if (t.rot) o.push('50', f(t.rot));
      if (t.align === 'center') o.push('72', '1', '11', f(t.x), '21', f(t.y), '31', '0');
    }
    o.push('0', 'ENDSEC', '0', 'EOF');
    return o.join('\r\n') + '\r\n';
  }

  /* ───────── le SVG (affichage) ───────── */
  const COULEURS = { CONTOUR: 'currentColor', COUPE: '#d9ad40', AXE: '#d0503c', COTES: '#3f9f74', TEXTE: 'currentColor' };
  const lisible = s => String(s).replace(/%%c/g, 'Ø').replace(/%%d/g, '°');
  const xe = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  function svg(points, c, nom = 'outil', zCoupe = null, reference = '', opts = {}) {
    const P = plan(points, c, nom, zCoupe, reference, opts.cartouche || 'bas'), h = P.hauteur, xs = [], ys = [];
    const add = ([x, y]) => { xs.push(x); ys.push(y); };
    P.polys.filter(p => p.layer !== 'PROFIL').forEach(p => p.pts.forEach(add)); P.lines.forEach(l => { add(l.a); add(l.b); });
    for (const t of P.texts) {
      const w = lisible(t.txt).length * t.h * 0.58;
      if (t.rot) { add([t.x - t.h, t.y - w / 2]); add([t.x + t.h, t.y + w / 2]); } else { const x0 = t.align === 'center' ? t.x - w / 2 : t.x; add([x0, t.y]); add([x0 + w, t.y + t.h]); }
    }
    const m = 2 * h, x0 = Math.min(...xs) - m, x1 = Math.max(...xs) + m, y0 = Math.min(...ys) - m, y1 = Math.max(...ys) + m;
    const Y = y => +(-y).toFixed(4), X = x => +x.toFixed(4), sw = Math.max(0.05, h * 0.08);
    const pl = p => p.pts.map(([x, y]) => `${X(x)},${Y(y)}`).join(' ');
    const o = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${X(x0)} ${Y(y1)} ${X(x1 - x0)} ${X(y1 - y0)}"${opts.classe ? ` class="${opts.classe}"` : ''} role="img" aria-label="${xe(nom)}" font-family="Barlow,Arial,sans-serif">`];
    const contour = P.polys.find(p => p.layer === 'CONTOUR');
    o.push(`<polygon points="${pl(contour)}" fill="currentColor" fill-opacity=".07" stroke="${COULEURS.CONTOUR}" stroke-width="${sw}" stroke-linejoin="round"/>`);
    P.polys.filter(p => p.layer === 'COUPE').forEach(p => o.push(`<polyline points="${pl(p)}" fill="none" stroke="${COULEURS.COUPE}" stroke-width="${sw * 2.2}" stroke-linejoin="round" stroke-linecap="round"/>`));
    for (const l of P.lines) {
      const dash = l.layer === 'AXE' ? ` stroke-dasharray="${h * 2} ${h * 0.6} ${h * 0.4} ${h * 0.6}"` : '';
      o.push(`<line x1="${X(l.a[0])}" y1="${Y(l.a[1])}" x2="${X(l.b[0])}" y2="${Y(l.b[1])}" stroke="${COULEURS[l.layer]}" stroke-width="${l.layer === 'COUPE' ? sw * 1.5 : sw * 0.8}"${dash}/>`);
    }
    P.solids.forEach(s => o.push(`<polygon points="${pl(s)}" fill="${COULEURS[s.layer]}"/>`));
    for (const t of P.texts) {
      const anc = t.align === 'center' ? ' text-anchor="middle"' : '', rot = t.rot ? ` transform="rotate(${-t.rot} ${X(t.x)} ${Y(t.y)})"` : '';
      o.push(`<text x="${X(t.x)}" y="${Y(t.y)}" font-size="${+t.h.toFixed(3)}" fill="${COULEURS[t.layer]}"${anc}${rot}${t.rot ? ' dominant-baseline="middle"' : ''}>${xe(lisible(t.txt))}</text>`);
    }
    o.push('</svg>');
    return o.join('');
  }

  /* tout d'un coup : cotes → profil → fichiers */
  function dessiner(o, e) {
    const c = cotes(o, e), pr = profil(c), nom = o.name || 'outil', ref = o.articleNr || (e && e.ref) || '';
    return { cotes: c, profil: pr, nom, reference: ref,
      step: () => step(pr.points, nom, pr.zCoupe, ref), dxf: () => dxf(pr.points, c, nom, pr.zCoupe, ref), svg: opts => svg(pr.points, c, nom, pr.zCoupe, ref, opts) };
  }
  const nomFichier = (o, e) => (ascii(`${o.articleNr || (e && e.ref) || ''}_${o.name || 'outil'}`).replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[._]+|[._]+$/g, '') || 'outil').slice(0, 80);

  root.DessinOutil = { cotes, profil, step, dxf, svg, plan, dessiner, nomFichier, geometrieCatalogue, geometrieNom, nettoyer, FAMILLES, EPS_POINTE };
})(typeof window !== 'undefined' ? window : globalThis);
