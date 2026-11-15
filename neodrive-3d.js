/* Visualiseur NeoDrive en 3D (portage web du canevas 3D de NeoDrive bureau) :
   trajectoire 3D synchronisée avec l'avancement, outil dessiné d'après sa fiche @ ToolDescription @,
   enlèvement de matière (brut en carte de hauteurs), pièce STEP superposée avec sélection de face. */
(function () {
  'use strict';
  const tr = (s, v) => (window.t ? window.t(s, v) : s);
  const COUL_BRUT = [0.70, 0.74, 0.80], COUL_HAUT = [0.96, 0.78, 0.48], COUL_FOND = [0.86, 0.45, 0.25];

  /* ---------- l'outil : profil, et sa surface basse (cote de la pointe → hauteur à la distance d de l'axe) ---------- */
  const cacheOutils = new Map();
  function outilDe(prog, art, d) {
    const k = `${art}|${d}`;
    if (cacheOutils.has(k)) return cacheOutils.get(k);
    const g = art && prog.geo && prog.geo[art];
    const src = g ? { name: g.name, geometry: { ...g.geometry } } : { name: 'Cyl', geometry: { Diameter: d || 3 } };
    const c = DessinOutil.cotes(src), pr = DessinOutil.profil(c), P = pr.points;
    const coupe = P.filter(([, z]) => z <= pr.zCoupe + 1e-9), rmax = Math.max(...(coupe.length ? coupe : P).map(([r]) => r));
    // bas(d) : la cote la plus basse de l'outil à la distance d de l'axe (premier passage du profil au rayon d)
    const N = 64, table = new Float32Array(N + 1);
    for (let i = 0; i <= N; i++) {
      const dd = rmax * i / N; let z = Infinity;
      if (P[0][0] >= dd - 1e-9) z = P[0][1];
      else for (let j = 1; j < P.length; j++) { const [ra, za] = P[j - 1], [rb, zb] = P[j]; if (rb >= dd - 1e-9 && ra < dd) { z = za + (zb - za) * (dd - ra) / ((rb - ra) || 1); break; } }
      table[i] = z;
    }
    const o = { c, profil: pr, rmax, bas: dd => table[Math.min(N, Math.round(dd / rmax * N))] };
    cacheOutils.set(k, o);
    return o;
  }

  /* ---------- le brut : une colonne de matière par cellule ---------- */
  class Brut {
    constructor(x0, x1, y0, y1, zb, zh, maxCel = 140000) {
      const lx = Math.max(x1 - x0, 1e-3), ly = Math.max(y1 - y0, 1e-3);
      this.pas = Math.max(0.02, Math.sqrt(lx * ly / maxCel));
      this.nx = Math.max(2, Math.ceil(lx / this.pas)); this.ny = Math.max(2, Math.ceil(ly / this.pas));
      Object.assign(this, { x0, y0, zb, zh }); this.h = new Float32Array(this.nx * this.ny); this.reset();
    }
    reset() { this.h.fill(this.zh); this.k = 0; }
    tampon(x, y, z, o) {
      const p = this.pas, r = o.rmax, i0 = Math.max(0, Math.floor((x - r - this.x0) / p)), i1 = Math.min(this.nx - 1, Math.ceil((x + r - this.x0) / p));
      const j0 = Math.max(0, Math.floor((y - r - this.y0) / p)), j1 = Math.min(this.ny - 1, Math.ceil((y + r - this.y0) / p));
      if (z >= this.zh) return;
      for (let j = j0; j <= j1; j++) {
        const cy = this.y0 + (j + 0.5) * p - y;
        for (let i = i0; i <= i1; i++) {
          const cx = this.x0 + (i + 0.5) * p - x, d = Math.hypot(cx, cy);
          if (d > r) continue;
          const zz = Math.max(this.zb, z + o.bas(d)), q = j * this.nx + i;
          if (zz < this.h[q]) this.h[q] = zz;
        }
      }
    }
    segment(s, f, o) {                                              // l'outil glisse de s.a vers s.b, jusqu'à la fraction f
      const L = s.L * f, n = Math.max(1, Math.ceil(L / (this.pas * 0.7)));
      for (let k = 0; k <= n; k++) { const u = f * k / n; this.tampon(s.a.x + (s.b.x - s.a.x) * u, s.a.y + (s.b.y - s.a.y) * u, s.a.z + (s.b.z - s.a.z) * u, o); }
    }
    /* applique le parcours jusqu'à la longueur lim (les segments entiers une fois, le segment en cours à chaque appel) */
    appliquer(segs, lim, outil) {
      if (this.lim !== undefined && lim < this.lim) this.reset();
      this.lim = lim;
      while (this.k < segs.length && segs[this.k].s + segs[this.k].L <= lim) { const s = segs[this.k++]; if (s.cut && Math.min(s.a.z, s.b.z) < this.zh) this.segment(s, 1, outil(s.b)); }
      const s = segs[this.k];
      if (s && s.s < lim && s.cut) this.segment(s, (lim - s.s) / s.L, outil(s.b));
    }
  }

  /* ---------- maillage du brut : dessus (une grille), flancs et dessous ---------- */
  function maillageBrut(T, b) {
    const { nx, ny } = b, nv = nx * ny, pos = new Float32Array(nv * 3), col = new Float32Array(nv * 3), idx = new Uint32Array((nx - 1) * (ny - 1) * 6);
    for (let j = 0, q = 0; j < ny; j++) for (let i = 0; i < nx; i++, q++) { pos[3 * q] = b.x0 + (i + 0.5) * b.pas; pos[3 * q + 1] = b.y0 + (j + 0.5) * b.pas; }
    let t = 0;
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i; idx.set([a, a + 1, a + nx + 1, a, a + nx + 1, a + nx], t); t += 6; }
    const dessus = new T.BufferGeometry();
    dessus.setAttribute('position', new T.BufferAttribute(pos, 3)); dessus.setAttribute('color', new T.BufferAttribute(col, 3)); dessus.setIndex(new T.BufferAttribute(idx, 1));
    // le tour du brut, en suivant les cellules du bord, et le dessous
    const tour = [];
    for (let i = 0; i < nx; i++) tour.push(i); for (let j = 1; j < ny; j++) tour.push(j * nx + nx - 1);
    for (let i = nx - 2; i >= 0; i--) tour.push((ny - 1) * nx + i); for (let j = ny - 2; j > 0; j--) tour.push(j * nx);
    const nt = tour.length, fp = new Float32Array((nt * 2 + 4) * 3), fi = [];
    for (let k = 0; k < nt; k++) { const a = 2 * k, b2 = 2 * ((k + 1) % nt); fi.push(a, b2, a + 1, b2, b2 + 1, a + 1); }
    const B = nt * 2, x0 = pos[0], y0 = pos[1], x1 = pos[3 * (nx - 1)], y1 = pos[3 * (nv - 1) + 1];
    fp.set([x0, y0, b.zb, x1, y0, b.zb, x1, y1, b.zb, x0, y1, b.zb], B * 3); fi.push(B, B + 2, B + 1, B, B + 3, B + 2);
    const flancs = new T.BufferGeometry(); flancs.setAttribute('position', new T.BufferAttribute(fp, 3)); flancs.setIndex(fi);
    const mat = new T.MeshStandardMaterial({ vertexColors: true, metalness: 0.15, roughness: 0.75, side: T.DoubleSide });
    const matF = new T.MeshStandardMaterial({ color: new T.Color(...COUL_BRUT), metalness: 0.15, roughness: 0.75, side: T.DoubleSide });
    const g = new T.Group(); g.add(new T.Mesh(dessus, mat), new T.Mesh(flancs, matF));
    g.userData.maj = () => {
      let hmin = b.zh; for (let q = 0; q < nv; q++) if (b.h[q] < hmin) hmin = b.h[q];
      const prof = Math.max(1e-6, b.zh - hmin);
      for (let q = 0; q < nv; q++) {
        const z = b.h[q]; pos[3 * q + 2] = z;
        const c = z >= b.zh - 1e-4 ? COUL_BRUT : (u => COUL_HAUT.map((v, k) => v + (COUL_FOND[k] - v) * u))(Math.min(1, (b.zh - z) / prof));
        col[3 * q] = c[0]; col[3 * q + 1] = c[1]; col[3 * q + 2] = c[2];
      }
      for (let k = 0; k < nt; k++) { const q = tour[k]; fp.set([pos[3 * q], pos[3 * q + 1], b.h[q], pos[3 * q], pos[3 * q + 1], b.zb], 6 * k); }
      dessus.attributes.position.needsUpdate = dessus.attributes.color.needsUpdate = true; dessus.computeVertexNormals(); dessus.computeBoundingSphere();
      flancs.attributes.position.needsUpdate = true; flancs.computeVertexNormals();
    };
    g.userData.maj();
    return g;
  }

  /* ---------- la vue ---------- */
  let v = null, vP = null, el = null, prog = null, segs = [], G = {}, brut = null, piece = null, choix = null, dernierBrut = 0, info = () => {};
  async function activer(conteneur, opts = {}) {
    el = conteneur; info = opts.info || info;
    if (!vP) vP = Vue3D.creer(conteneur, { onPick: choisir }).then(x => (v = x));
    return vP;
  }
  function choisir(hit) {
    if (choix) { v.racine.remove(choix); Vue3D.liberer(choix); choix = null; }
    if (!hit || !piece || !piece.children.includes(hit.object)) { info(''); v.rendre(); return; }
    choix = Vue3D.surligner(v.T, hit); if (choix) { choix.position.copy(piece.position); v.racine.add(choix); }
    const n = hit.face.normal, z = hit.point.z;
    const sorte = Math.abs(n.z) > 0.999 ? tr('plane horizontale, Z {z} mm', { z: z.toFixed(3) }) : Math.abs(n.z) < 1e-3 ? tr('verticale') : tr('inclinée ({a}°)', { a: (Math.acos(Math.abs(n.z)) * 180 / Math.PI).toFixed(1) });
    info(tr('Face {k} : {s}', { k: (choix && choix.userData.face + 1) || '?', s: sorte }));
    v.rendre();
  }
  function construire(p, s) {
    const T = v.T; prog = p; segs = s;
    ['chemin', 'courant', 'outil', 'grille'].forEach(k => { if (G[k]) { v.racine.remove(G[k]); Vue3D.liberer(G[k]); G[k] = null; } });
    if (brut && brut.g) { v.racine.remove(brut.g); Vue3D.liberer(brut.g); } brut = null;
    if (!p || !p.pts.length) { v.rendre(); return; }
    const pos = new Float32Array(segs.length * 6), col = new Float32Array(segs.length * 6), cBr = new T.Color(Vue3D.css('--brass') || '#c9a227'), cRa = new T.Color(0x8a93a3);
    segs.forEach((q, i) => { pos.set([q.a.x, q.a.y, q.a.z, q.b.x, q.b.y, q.b.z], 6 * i); const c = q.cut ? cBr : cRa; col.set([c.r, c.g, c.b, c.r, c.g, c.b], 6 * i); });
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('color', new T.BufferAttribute(col, 3));
    G.chemin = new T.LineSegments(geo, new T.LineBasicMaterial({ vertexColors: true })); v.racine.add(G.chemin);
    const cg = new T.BufferGeometry(); cg.setAttribute('position', new T.BufferAttribute(new Float32Array(6), 3));
    G.courant = new T.Line(cg, new T.LineBasicMaterial({ color: cBr })); v.racine.add(G.courant);
    // emprise de l'usinage : le brut et la grille au Z0
    const cut = p.pts.filter(q => !q.rapid), base = cut.length ? cut : p.pts;
    let rOut = 1, zmin = 0, x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const q of p.pts) { rOut = Math.max(rOut, (q.d || 3) / 2); zmin = Math.min(zmin, q.z); }
    for (const q of base) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
    const m = rOut + 2; x0 -= m; x1 += m; y0 -= m; y1 += m;
    brut = new Brut(x0, x1, y0, y1, Math.min(zmin - 1, -2), 0);
    const L = Math.max(x1 - x0, y1 - y0), grille = new T.GridHelper(Math.ceil(L / 10) * 10 + 10, Math.ceil(L / 10) + 1, 0x667085, 0x3a4150);
    grille.rotation.x = Math.PI / 2; grille.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0); grille.material.transparent = true; grille.material.opacity = 0.35;
    G.grille = grille; v.racine.add(grille);
    v.cadrer(new T.Box3().setFromObject(G.chemin).union(new T.Box3(new T.Vector3(x0, y0, brut.zb), new T.Vector3(x1, y1, 0))), true);
  }
  function poserOutil(pt) {
    const T = v.T, o = outilDe(prog, pt.t, pt.d), k = `${pt.t}|${pt.d}`;
    if (!G.outil || G.outil.userData.k !== k) {
      if (G.outil) { v.racine.remove(G.outil); Vue3D.liberer(G.outil); }
      G.outil = Vue3D.outil(T, o.profil.points, o.profil.zCoupe, { opacite: 0.92, segments: 32 }); G.outil.userData.k = k; v.racine.add(G.outil);
    }
    G.outil.position.set(pt.x, pt.y, pt.z);
  }
  /* état : { prog, segs, lim, matiere, playing } — appelé à chaque dessin du visualiseur */
  function maj(e) {
    if (!v) return;
    if (e.prog !== prog || e.segs !== segs) construire(e.prog, e.segs);
    if (!prog || !segs.length) return;
    let k = 0; while (k < segs.length && segs[k].s + segs[k].L <= e.lim) k++;
    G.chemin.geometry.setDrawRange(0, 2 * k);
    const s = segs[Math.min(k, segs.length - 1)], f = k < segs.length ? Math.max(0, Math.min(1, (e.lim - s.s) / s.L)) : 1;
    const pt = { x: s.a.x + (s.b.x - s.a.x) * f, y: s.a.y + (s.b.y - s.a.y) * f, z: s.a.z + (s.b.z - s.a.z) * f, t: s.b.t, d: s.b.d };
    const cp = G.courant.geometry.attributes.position; cp.array.set([s.a.x, s.a.y, s.a.z, pt.x, pt.y, pt.z]); cp.needsUpdate = true; G.courant.visible = k < segs.length && f > 0;
    poserOutil(pt);
    if (e.matiere) {
      const now = performance.now();
      if (!brut.g) { brut.g = maillageBrut(v.T, brut); v.racine.add(brut.g); }
      brut.g.visible = true;
      if (!e.playing || now - dernierBrut > 120) {                    // en lecture : la matière se met à jour 8 fois par seconde
        brut.appliquer(segs, e.lim, q => outilDe(prog, q.t, q.d)); brut.g.userData.maj(); dernierBrut = now;
      }
    } else if (brut && brut.g) brut.g.visible = false;
    v.rendre();
  }
  /* pièce STEP : maillage superposé ; recalée dessus en Z0 et centrée en X0 Y0 si demandé (origine au centre, comme le générateur) */
  async function chargerPiece(fichier, recaler) {
    const s = await Vecteurs.readSTEP3D(await fichier.arrayBuffer()), T = v.T;
    if (piece) { v.racine.remove(piece); Vue3D.liberer(piece); }
    if (choix) { v.racine.remove(choix); Vue3D.liberer(choix); choix = null; }
    piece = Vue3D.solide(T, s, { opacite: 0.72 });
    const [bx0, by0, , bx1, by1, bz1] = s.bounds;
    if (recaler) piece.position.set(-(bx0 + bx1) / 2, -(by0 + by1) / 2, -bz1);
    v.racine.add(piece); v.cadrer(new T.Box3().setFromObject(piece).union(G.chemin ? new T.Box3().setFromObject(G.chemin) : new T.Box3()), false);
    return { faces: s.meshes.reduce((n, m) => n + m.faces.length, 0), taille: [bx1 - bx0, by1 - by0, s.bounds[5] - s.bounds[2]] };
  }
  function montrerPiece(oui) { if (piece) { piece.visible = oui; if (choix) choix.visible = oui; v.rendre(); } }
  window.Neo3D = { activer, maj, chargerPiece, montrerPiece, cadrer: () => v && v.cadrer(null, true), Brut, outilDe };
})();
