/* VectorDrive web : parcours d'outil 2D génériques (contour, poche, gravure, perçage), par couleur d'outil,
   temps estimé et programme ISO (G-code) générique. Les opérations sont gardées dans le .vdz (extra.fao_web),
   à part des réglages FAO de l'application de bureau qui restent intacts. Aucune donnée d'atelier n'est fournie :
   diamètres, vitesses et profondeurs sont ceux que tu saisis. */
(function () {
  'use strict';
  const W = window.VDWeb, O = window.VDOutils, tr = (s, v) => (window.t ? window.t(s, v) : s);
  const CLE = 'fao_web';
  const TYPES = ['contour', 'poche', 'gravure', 'percage'];
  const machineDefaut = () => ({ zSecu: 5, rapide: 3000, nom: '' });
  function operationDefaut(type = 'contour', outil = 0) {
    return { id: W.uid(), nom: '', type, outils: [outil], cote: type === 'contour' ? 'ext' : 'sur', diametre: 3, profondeur: 1, passe: 0.5, recouvrement: 40,
      avance: 600, plongee: 200, rotation: 18000, actif: true };
  }
  const reglages = doc => ({ machine: machineDefaut(), operations: [], ...(doc.extra && doc.extra[CLE]) });
  const avecReglages = (doc, r) => ({ ...doc, extra: { ...doc.extra, [CLE]: r } });

  /* objets d'une opération : couleur d'outil choisie, calques et objets visibles */
  function objets(doc, op) {
    const out = [], voir = it => { if (it.visible === false) return; if (it.kind === 'group') return it.children.forEach(voir); if (op.outils.includes(it.tool)) out.push(it); };
    doc.layers.filter(L => L.visible).forEach(L => L.items.forEach(voir));
    return out;
  }
  const ferme = q => q.length > 3 && Math.hypot(q[0][0] - q[q.length - 1][0], q[0][1] - q[q.length - 1][1]) < 1e-6;
  const niveaux = op => { const z = [], p = Math.max(0.01, op.passe || op.profondeur); for (let d = p; d < op.profondeur - 1e-9; d += p) z.push(-d); z.push(-op.profondeur); return z; };

  /* trajectoires d'une opération : [{z, pts, ferme}] dans l'ordre d'usinage, ou [{z, pts: [p], percage}] */
  async function calculer(doc, op) {
    const its = objets(doc, op), r = op.diametre / 2, boucles = [];
    if (!its.length) return { chemins: [], avis: tr('Aucun objet de cette couleur d\'outil.') };
    if (op.type === 'percage') {
      const pts = [];
      its.forEach(it => W.polys(it).filter(ferme).forEach(q => { const xs = q.map(p => p[0]), ys = q.map(p => p[1]);
        pts.push([(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]); }));
      return { chemins: ordonner(pts.map(p => ({ pts: [p], ferme: false, percage: true }))).map(c => ({ ...c, z: -op.profondeur })) };
    }
    if (op.type === 'gravure' || (op.type === 'contour' && op.cote === 'sur')) its.forEach(it => W.polys(it).forEach(q => boucles.push({ pts: q, ferme: ferme(q) })));
    else {
      const C = await O.clipper(), regions = [];
      for (const it of its) regions.push(...(await O.region(C, it)));
      const ouverts = its.flatMap(it => W.polys(it).filter(q => !ferme(q)));
      ouverts.forEach(q => boucles.push({ pts: q, ferme: false }));
      if (op.type === 'contour') {
        const o = new C.ClipperOffset(2, 5), sol = new C.Paths(); o.AddPaths(regions, C.JoinType.jtRound, C.EndType.etClosedPolygon); o.Execute(sol, (op.cote === 'ext' ? r : -r) * 1000);
        sol.forEach(p => boucles.push({ pts: O.deC(p), ferme: true }));
      } else {
        const pas = Math.max(0.01, op.diametre * (1 - (op.recouvrement ?? 40) / 100)), anneaux = await O.decalages(regions, r, pas);
        if (!anneaux.length) return { chemins: [], avis: tr('Outil trop gros pour la poche.') };
        anneaux.reverse().forEach(a => a.forEach(q => boucles.push({ pts: q, ferme: true })));          // du centre vers le bord
      }
    }
    const chemins = [];
    for (const z of niveaux(op)) (op.type === 'poche' ? boucles : ordonner(boucles)).forEach(b => chemins.push({ ...b, z }));
    return { chemins };
  }
  function ordonner(liste) {                                                // plus proche voisin, depuis l'origine
    const reste = liste.slice(), out = []; let p = [0, 0];
    while (reste.length) { let k = 0, d = Infinity; reste.forEach((c, i) => { const e = Math.hypot(c.pts[0][0] - p[0], c.pts[0][1] - p[1]); if (e < d) { d = e; k = i; } });
      const c = reste.splice(k, 1)[0]; out.push(c); p = c.pts[c.pts.length - 1]; }
    return out;
  }
  const longueur = q => { let l = 0; for (let i = 1; i < q.length; i++) l += Math.hypot(q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]); return l; };
  function temps(chemins, op, m) {                                          // minutes : coupe + plongées + déplacements rapides
    let coupe = 0, rapide = 0, plonge = 0, p = [0, 0];
    for (const c of chemins) { rapide += Math.hypot(c.pts[0][0] - p[0], c.pts[0][1] - p[1]) + 2 * m.zSecu; plonge += m.zSecu - c.z; coupe += longueur(c.pts); p = c.pts[c.pts.length - 1]; }
    return coupe / Math.max(1, op.avance) + plonge / Math.max(1, op.plongee) + rapide / Math.max(1, m.rapide);
  }
  async function toutCalculer(doc) {
    const R = reglages(doc), res = [];
    for (const op of R.operations) { if (!op.actif) { res.push({ op, chemins: [], minutes: 0 }); continue; }
      const c = await calculer(doc, op); res.push({ op, ...c, minutes: temps(c.chemins, op, R.machine) }); }
    return res;
  }
  /* programme ISO générique : à adapter au post-processeur de ta machine */
  function gcode(doc, resultats) {
    const m = reglages(doc).machine, f = v => (Math.round(v * 1000) / 1000).toString(), L = ['%', `(VectorDrive web - ${new Date().toISOString().slice(0, 10)})`, '(Programme ISO generique : verifier avant usinage)', 'G21 G90 G17', `G0 Z${f(m.zSecu)}`];
    for (const { op, chemins } of resultats) {
      if (!op.actif || !chemins.length) continue;
      L.push(`(${op.nom || op.type} - D${f(op.diametre)} - prof ${f(op.profondeur)})`, `T${(op.outils[0] || 0) + 1} M6`, `S${Math.round(op.rotation)} M3`);
      for (const c of chemins) {
        L.push(`G0 X${f(c.pts[0][0])} Y${f(c.pts[0][1])}`, `G0 Z${f(Math.min(m.zSecu, 1))}`);
        if (c.percage) { const zs = niveaux(op); for (const z of zs) L.push(`G1 Z${f(z)} F${Math.round(op.plongee)}`, 'G0 Z0.5'); L.push(`G0 Z${f(m.zSecu)}`); continue; }
        L.push(`G1 Z${f(c.z)} F${Math.round(op.plongee)}`);
        c.pts.slice(1).forEach(([x, y], i) => L.push(`G1 X${f(x)} Y${f(y)}${i ? '' : ` F${Math.round(op.avance)}`}`));
        L.push(`G0 Z${f(m.zSecu)}`);
      }
      L.push('M5');
    }
    L.push(`G0 Z${f(m.zSecu)}`, 'M30', '%');
    return L.join('\n') + '\n';
  }
  window.VDFao = { TYPES, CLE, reglages, avecReglages, operationDefaut, machineDefaut, objets, calculer, toutCalculer, temps, gcode, niveaux };
})();
