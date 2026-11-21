/* VectorDrive web : outils de dessin au-delà des formes de base.
   Polygones, étoiles, codes 2D, textes (polices du poste par l'API Local Font Access, polices web ou fichier, via opentype.js),
   booléens et décalages (Clipper, chargé à la demande), alignement, symétrie, groupes, réseaux,
   et exports qui gardent calques et couleurs (DXF, SVG, PDF, EPS, PNG). */
(function () {
  'use strict';
  const W = window.VDWeb, tr = (s, v) => (window.t ? window.t(s, v) : s);
  const charger = (url, glob) => (window[glob] ? Promise.resolve(window[glob]) : new Promise((ok, ko) => {
    if (typeof document === 'undefined') { ko(new Error(glob)); return; }
    const s = document.createElement('script'); s.src = url; s.onload = () => (window[glob] ? ok(window[glob]) : ko(new Error(glob)));
    s.onerror = () => ko(new Error(tr('Bibliothèque indisponible (connexion requise au premier usage) : {n}', { n: glob }))); document.head.append(s);
  }));
  const CLIPPER = 'https://cdn.jsdelivr.net/npm/clipper-lib@6.4.2/clipper.js', OPENTYPE = 'https://cdnjs.cloudflare.com/ajax/libs/opentype.js/1.3.4/opentype.min.js';
  const clipper = () => charger(CLIPPER, 'ClipperLib'), opentypeP = () => charger(OPENTYPE, 'opentype');

  /* ---------- formes ---------- */
  function polygone(cx, cy, r, n, outil = 0, rot = 90) {
    const p = []; for (let k = 0; k < n; k++) { const a = (rot + 360 * k / n) * Math.PI / 180; p.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
    return W.polyligne(p, true, outil);
  }
  function etoile(cx, cy, r1, r2, n, outil = 0) {
    const p = []; for (let k = 0; k < 2 * n; k++) { const a = (90 + 180 * k / n) * Math.PI / 180, r = k % 2 ? r2 : r1; p.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
    return W.polyligne(p, true, outil);
  }
  function arc(cx, cy, r, a0, a1, outil = 0) {                               // arc de cercle en Bézier (quarts au plus)
    let d = a1 - a0; if (d <= 0) d += 360; const n = Math.ceil(d / 90), segs = [], h = d / n * Math.PI / 180, k = 4 / 3 * Math.tan(h / 4);
    for (let i = 0; i < n; i++) {
      const t0 = a0 * Math.PI / 180 + i * h, t1 = t0 + h, [c0, s0, c1, s1] = [Math.cos(t0), Math.sin(t0), Math.cos(t1), Math.sin(t1)];
      segs.push(['C', cx + r * c0, cy + r * s0, cx + r * (c0 - k * s0), cy + r * (s0 + k * c0), cx + r * (c1 + k * s1), cy + r * (s1 - k * c1), cx + r * c1, cy + r * s1]);
    }
    return { ...W.polyligne([[0, 0], [1, 0]], false, outil), path: [{ closed: d >= 360 - 1e-9, segs }] };
  }
  /* code 2D ou linéaire : modules réunis par lignes, une forme remplie ; x, y = coin bas gauche */
  function code(kind, texte, x, y, module = 0.5, hauteur = 15, outil = 0) {
    const m = Codes.encode(kind, texte), lin = Codes.isLinear(kind), contours = [];
    const rows = lin ? [m[0]] : m, mh = lin ? hauteur : module;
    rows.forEach((row, i) => {
      const y1 = y + (rows.length - i) * mh, y0 = y1 - mh;
      for (let j = 0; j < row.length;) { if (!row[j]) { j++; continue; } let k = j; while (k < row.length && row[k]) k++;
        const a = x + j * module, b = x + k * module; contours.push({ closed: true, segs: [['L', a, y0, b, y0], ['L', b, y0, b, y1], ['L', b, y1, a, y1], ['L', a, y1, a, y0]] }); j = k; }
    });
    return { ...W.polyligne([[0, 0], [1, 0]], false, outil), path: contours, filled: true, name: `${kind}: ${texte}`, extra: { code: { kind, texte, module, hauteur } } };
  }

  /* ---------- polices ---------- */
  const FS = 'https://cdn.jsdelivr.net/npm/@fontsource/';
  const WEB = [['Roboto', 'roboto@5/files/roboto-latin-400-normal'], ['Roboto Bold', 'roboto@5/files/roboto-latin-700-normal'], ['Barlow SemiBold', 'barlow@5/files/barlow-latin-600-normal'],
    ['Oswald', 'oswald@5/files/oswald-latin-500-normal'], ['Roboto Mono', 'roboto-mono@5/files/roboto-mono-latin-400-normal'], ['Playfair Display', 'playfair-display@5/files/playfair-display-latin-700-normal'],
    ['Great Vibes', 'great-vibes@5/files/great-vibes-latin-400-normal'], ['Stardos Stencil', 'stardos-stencil@5/files/stardos-stencil-latin-700-normal']];
  const polices = new Map();                                                // nom -> { source, charger: () => Promise<font> , font }
  WEB.forEach(([nom, f]) => polices.set(nom, { source: 'web', url: FS + f + '.woff' }));
  async function policesDuPoste() {                                         // API Local Font Access (Chrome, Edge) : demande l'autorisation
    if (typeof window.queryLocalFonts !== 'function') throw new Error(tr('Ce navigateur ne donne pas accès aux polices du poste (Chrome ou Edge le permettent) : charge un fichier de police.'));
    const liste = await window.queryLocalFonts(); let n = 0;
    for (const f of liste) { if (!polices.has(f.fullName)) { polices.set(f.fullName, { source: 'poste', donnee: f, famille: f.family, style: f.style }); n++; } }
    return n;
  }
  async function policeFichier(fichier) {
    const ot = await opentypeP(), font = ot.parse(await fichier.arrayBuffer());
    const nom = (font.names.fullName && (font.names.fullName.en || Object.values(font.names.fullName)[0])) || fichier.name;
    polices.set(nom, { source: 'fichier', font }); return nom;
  }
  async function police(nom) {
    const p = polices.get(nom) || polices.get('Roboto'); if (!p) throw new Error(tr('Police inconnue : {n}', { n: nom }));
    if (p.font) return p.font;
    const ot = await opentypeP();
    const buf = p.source === 'poste' ? await (await p.donnee.blob()).arrayBuffer() : await (await fetch(p.url)).arrayBuffer();
    try { p.font = ot.parse(buf); } catch (e) { throw new Error(tr('Police illisible : {e}', { e: `${nom} (${e.message})` })); }
    return p.font;
  }
  /* texte vivant (même structure que l'application) : contour calculé avec la police ; size = hauteur des capitales (mm) */
  async function texte(o) {
    const font = await police(o.font || 'Roboto'), it = { id: o.id || W.uid(), name: o.name || '', tool: o.tool ?? 0, visible: true, locked: false, extra: o.extra || {}, kind: 'text',
      text: o.text || '', font: o.font || 'Roboto', size: o.size || 10, matrix: o.matrix || [1, 0, 0, 1, o.x || 0, o.y || 0], align: o.align || 'left', spacing: o.spacing || 0,
      line_spacing: o.line_spacing || 1.2, width_ratio: o.width_ratio || 1 };
    it.outline = contourTexte(font, it); return it;
  }
  function contourTexte(font, it) {
    const upm = font.unitsPerEm, os2 = font.tables.os2 || {}, H = font.charToGlyph('H');
    const cap = os2.sCapHeight || (H && H.getBoundingBox ? H.getBoundingBox().y2 : 0) || upm * 0.7, k = it.size / cap, kx = k * (it.width_ratio || 1);
    const pas = it.size * (it.line_spacing || 1.2) * 1.25, esp = (it.spacing || 0) / (upm * kx), m = it.matrix || [1, 0, 0, 1, 0, 0];
    const out = [];
    String(it.text).split('\n').forEach((ligne, i) => {
      const larg = font.getAdvanceWidth(ligne, upm, { letterSpacing: esp }) * kx, dx = it.align === 'center' ? -larg / 2 : it.align === 'right' ? -larg : 0, dy = -i * pas;
      const P = (x, y) => W.appliquer(m, x * kx + dx, -y * k + dy);           // opentype : y vers le bas
      let cur = null, sx = 0, sy = 0, px = 0, py = 0;
      for (const c of font.getPath(ligne, 0, 0, upm, { letterSpacing: esp, kerning: true }).commands) {
        if (c.type === 'M') { if (cur && cur.segs.length) out.push(cur); cur = { closed: false, segs: [] }; sx = px = c.x; sy = py = c.y; }
        else if (c.type === 'L') { cur.segs.push(['L', ...P(px, py), ...P(c.x, c.y)]); px = c.x; py = c.y; }
        else if (c.type === 'Q') { cur.segs.push(['Q', ...P(px, py), ...P(c.x1, c.y1), ...P(c.x, c.y), 1]); px = c.x; py = c.y; }
        else if (c.type === 'C') { cur.segs.push(['C', ...P(px, py), ...P(c.x1, c.y1), ...P(c.x2, c.y2), ...P(c.x, c.y)]); px = c.x; py = c.y; }
        else if (c.type === 'Z' && cur) { if (Math.hypot(px - sx, py - sy) > 1e-9) cur.segs.push(['L', ...P(px, py), ...P(sx, sy)]); cur.closed = true; out.push(cur); cur = null; px = sx; py = sy; }
      }
      if (cur && cur.segs.length) out.push(cur);
    });
    return out;
  }
  const retexter = async (it, champs) => texte({ ...it, ...champs, id: it.id, extra: it.extra });

  /* ---------- booléens et décalages (Clipper, 1 µm) ---------- */
  const S = 1000;
  const versC = q => q.map(([x, y]) => ({ X: Math.round(x * S), Y: Math.round(y * S) }));
  const deC = p => { const q = p.map(({ X, Y }) => [X / S, Y / S]); if (q.length) q.push(q[0].slice()); return q; };
  const ferme = q => q.length > 3 && Math.hypot(q[0][0] - q[q.length - 1][0], q[0][1] - q[q.length - 1][1]) < 1e-6;
  async function region(C, it) {                                            // surface d'un objet : ses contours fermés, pair-impair
    const c = new C.Clipper(), sol = new C.Paths();
    c.AddPaths(W.polys(it).filter(ferme).map(versC), C.PolyType.ptSubject, true);
    c.Execute(C.ClipType.ctUnion, sol, C.PolyFillType.pftEvenOdd, C.PolyFillType.pftEvenOdd); return sol;
  }
  const versForme = (paths, modele) => ({ ...W.polyligne([[0, 0], [1, 0]], false, modele.tool), filled: !!modele.filled, path: paths.filter(p => p.length > 2).map(deC).map(q => ({ closed: true, segs: q.slice(0, -1).map((p, i) => ['L', ...p, ...q[i + 1]]) })) });
  /* op : 'union' | 'difference' (le premier moins les autres) | 'intersection' | 'xor' */
  async function booleen(items, op) {
    const C = await clipper(), regions = [];
    for (const it of items) regions.push(await region(C, it));
    if (regions.length < 2 && op !== 'union') throw new Error(tr('Choisis au moins deux objets fermés.'));
    const c = new C.Clipper(), sol = new C.Paths(), NZ = C.PolyFillType.pftNonZero;
    const type = { union: C.ClipType.ctUnion, difference: C.ClipType.ctDifference, intersection: C.ClipType.ctIntersection, xor: C.ClipType.ctXor }[op];
    if (op === 'intersection') {
      let acc = regions[0];
      for (const r of regions.slice(1)) { const k = new C.Clipper(), s = new C.Paths(); k.AddPaths(acc, C.PolyType.ptSubject, true); k.AddPaths(r, C.PolyType.ptClip, true); k.Execute(type, s, NZ, NZ); acc = s; }
      return versForme(acc, items[0]);
    }
    c.AddPaths(op === 'union' ? regions.flat() : regions[0], C.PolyType.ptSubject, true);
    if (op !== 'union') regions.slice(1).forEach(r => c.AddPaths(r, C.PolyType.ptClip, true));
    c.Execute(type, sol, NZ, NZ);
    return versForme(sol, items[0]);
  }
  /* décalage (mm, négatif vers l'intérieur) ; joints ronds, anguleux ou en biseau ; tracés ouverts : contour arrondi autour */
  async function decaler(it, d, joint = 'round') {
    const C = await clipper(), o = new C.ClipperOffset(2, 0.005 * S), sol = new C.Paths();
    const jt = { round: C.JoinType.jtRound, miter: C.JoinType.jtMiter, square: C.JoinType.jtSquare }[joint];
    const fermes = await region(C, it), ouverts = W.polys(it).filter(q => !ferme(q));
    o.AddPaths(fermes, jt, C.EndType.etClosedPolygon);
    if (ouverts.length) o.AddPaths(ouverts.map(versC), jt, C.EndType.etOpenRound);
    o.Execute(sol, d * S);
    return versForme(sol, it);
  }
  /* décalages successifs (poche) : rend les anneaux, de l'extérieur vers le centre */
  async function decalages(paths, premier, pas, max = 500) {
    const C = await clipper(), out = [];
    let d = premier;
    for (let i = 0; i < max; i++) { const o = new C.ClipperOffset(2, 0.005 * S), sol = new C.Paths(); o.AddPaths(paths, C.JoinType.jtRound, C.EndType.etClosedPolygon); o.Execute(sol, -d * S);
      if (!sol.length) break; out.push(sol.map(deC)); d += pas; }
    return out;
  }

  /* ---------- placement ---------- */
  function aligner(items, mode, ref) {                                      // ref = boîte de référence (sélection ou plaque)
    return items.map(it => { const b = W.boite([it]); if (!b) return it;
      const dx = { gauche: ref[0] - b[0], droite: ref[2] - b[2], centreX: (ref[0] + ref[2] - b[0] - b[2]) / 2 }[mode] || 0;
      const dy = { bas: ref[1] - b[1], haut: ref[3] - b[3], centreY: (ref[1] + ref[3] - b[1] - b[3]) / 2 }[mode] || 0;
      return dx || dy ? W.transformer(it, W.translation(dx, dy)) : it; });
  }
  const symetrie = (items, axe, b) => items.map(it => W.transformer(it, axe === 'h' ? W.echelle(-1, 1, (b[0] + b[2]) / 2, 0) : W.echelle(1, -1, 0, (b[1] + b[3]) / 2)));
  const grouper = items => ({ id: W.uid(), name: '', tool: items[0].tool, visible: true, locked: false, extra: {}, kind: 'group', children: items });
  function reseau(items, lignes, colonnes, dx, dy) {
    const out = [];
    for (let i = 0; i < lignes; i++) for (let j = 0; j < colonnes; j++) { if (!i && !j) continue; items.forEach(it => out.push(W.transformer(W.copie(it), W.translation(j * dx, i * dy)))); }
    return out;
  }

  /* ---------- exports avec calques et couleurs ---------- */
  const f3 = v => (Math.round(v * 1000) / 1000).toString();
  const hexRVB = h => { const n = parseInt(String(h).replace('#', '').padEnd(6, '0').slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const ACI = [[1, [255, 0, 0]], [2, [255, 255, 0]], [3, [0, 255, 0]], [4, [0, 255, 255]], [5, [0, 0, 255]], [6, [255, 0, 255]], [7, [0, 0, 0]], [8, [128, 128, 128]], [30, [255, 127, 0]], [40, [255, 191, 0]], [200, [127, 0, 255]], [32, [165, 82, 0]]];
  const aci = h => { const c = hexRVB(h); let b = 7, d = Infinity; for (const [n, r] of ACI) { const e = (r[0] - c[0]) ** 2 + (r[1] - c[1]) ** 2 + (r[2] - c[2]) ** 2; if (e < d) { d = e; b = n; } } return b; };
  function lots(doc) {                                                      // [{calque, couleur, rempli, polys}]
    const out = [];
    const ajouter = (L, it) => { if (it.visible === false) return; if (it.kind === 'group') return it.children.forEach(c => ajouter(L, c));
      const q = W.polys(it); if (q.length) out.push({ calque: L.name || 'Plan', couleur: (doc.tools[it.tool] || doc.tools[0] || { color: '#000000' }).color, rempli: !!it.filled || it.kind === 'text', polys: q }); };
    doc.layers.filter(L => L.visible).forEach(L => L.items.forEach(it => ajouter(L, it)));
    return out;
  }
  const nomCalque = s => String(s).replace(/[<>/\\":;?*|=,]/g, '_').slice(0, 60) || '0';
  function dxf(doc) {
    const L = lots(doc), noms = [...new Set(L.map(l => nomCalque(l.calque)))], coul = new Map(L.map(l => [nomCalque(l.calque), aci(l.couleur)]));
    const o = ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC', '0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER', '70', String(noms.length)];
    noms.forEach(n => o.push('0', 'LAYER', '2', n, '70', '0', '62', String(coul.get(n)), '6', 'CONTINUOUS'));
    o.push('0', 'ENDTAB', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES');
    for (const l of L) for (const p of l.polys) {
      const cl = W.polys && p.length > 2 && Math.hypot(p[0][0] - p[p.length - 1][0], p[0][1] - p[p.length - 1][1]) < 1e-9, pts = cl ? p.slice(0, -1) : p;
      o.push('0', 'POLYLINE', '8', nomCalque(l.calque), '62', String(aci(l.couleur)), '66', '1', '10', '0', '20', '0', '30', '0', '70', cl ? '1' : '0');
      pts.forEach(([x, y]) => o.push('0', 'VERTEX', '8', nomCalque(l.calque), '10', f3(x), '20', f3(y), '30', '0'));
      o.push('0', 'SEQEND', '8', nomCalque(l.calque));
    }
    o.push('0', 'ENDSEC', '0', 'EOF'); return o.join('\r\n') + '\r\n';
  }
  function cadre(doc, L, marge = 1) {
    const P = doc.plate, b = [Infinity, Infinity, -Infinity, -Infinity];
    L.forEach(l => l.polys.forEach(q => q.forEach(([x, y]) => { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); })));
    if (P && P.visible !== false) { b[0] = Math.min(b[0], P.x); b[1] = Math.min(b[1], P.y); b[2] = Math.max(b[2], P.x + P.width); b[3] = Math.max(b[3], P.y + P.height); }
    if (!(b[0] <= b[2])) return [0, 0, 1, 1];
    return [b[0] - marge, b[1] - marge, b[2] + marge, b[3] + marge];
  }
  function svg(doc) {
    const L = lots(doc), b = cadre(doc, L), w = b[2] - b[0], h = b[3] - b[1], X = x => f3(x - b[0]), Y = y => f3(b[3] - y), esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const parCalque = new Map(); L.forEach(l => { if (!parCalque.has(l.calque)) parCalque.set(l.calque, []); parCalque.get(l.calque).push(l); });
    const o = [`<?xml version="1.0" encoding="UTF-8"?>`, `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${f3(w)}mm" height="${f3(h)}mm" viewBox="0 0 ${f3(w)} ${f3(h)}">`];
    const P = doc.plate;
    if (P && P.visible !== false) o.push(`<rect x="${X(P.x)}" y="${Y(P.y + P.height)}" width="${f3(P.width)}" height="${f3(P.height)}" rx="${f3(P.corner_radius || 0)}" fill="none" stroke="#999" stroke-width="0.1"/>`);
    for (const [n, ls] of parCalque) {
      o.push(`<g inkscape:groupmode="layer" inkscape:label="${esc(n)}" id="${esc(nomCalque(n))}">`);
      for (const l of ls) o.push(`<path d="${l.polys.map(q => 'M' + q.map(([x, y], i) => `${i ? 'L' : ''}${X(x)} ${Y(y)}`).join(' ')).join(' ')}" fill="${l.rempli ? l.couleur : 'none'}" fill-rule="evenodd" stroke="${l.couleur}" stroke-width="0.1"/>`);
      o.push('</g>');
    }
    o.push('</svg>'); return o.join('\n') + '\n';
  }
  function ps(doc, pdf) {                                                   // corps commun PDF / EPS, en points
    const L = lots(doc), b = cadre(doc, L), k = 72 / 25.4, X = x => f3((x - b[0]) * k), Y = y => f3((y - b[1]) * k), corps = [];
    for (const l of L) {
      const [r, g, bl] = hexRVB(l.couleur).map(v => f3(v / 255)), chemin = l.polys.map(q => q.map(([x, y], i) => `${X(x)} ${Y(y)} ${i ? (pdf ? 'l' : 'lineto') : (pdf ? 'm' : 'moveto')}`).join(' ')).join(' ');
      corps.push(pdf ? `${r} ${g} ${bl} RG ${r} ${g} ${bl} rg ${chemin} ${l.rempli ? 'B*' : 'S'}` : `${r} ${g} ${bl} setrgbcolor newpath ${chemin} ${l.rempli ? 'gsave eofill grestore ' : ''}stroke`);
    }
    return { corps, w: (b[2] - b[0]) * k, h: (b[3] - b[1]) * k };
  }
  function eps(doc) {
    const { corps, w, h } = ps(doc, false);
    return ['%!PS-Adobe-3.0 EPSF-3.0', `%%BoundingBox: 0 0 ${Math.ceil(w)} ${Math.ceil(h)}`, `%%HiResBoundingBox: 0 0 ${f3(w)} ${f3(h)}`, '%%Creator: VectorDrive web (RomDuch)', '%%EndComments', '0.2 setlinewidth 1 setlinejoin 1 setlinecap', ...corps, 'showpage', '%%EOF'].join('\n') + '\n';
  }
  function pdf(doc) {
    const { corps, w, h } = ps(doc, true), contenu = '0.2 w 1 j 1 J\n' + corps.join('\n'), enc = new TextEncoder();
    const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f3(w)} ${f3(h)}] /Contents 4 0 R /Resources << >> >>`,
      `<< /Length ${enc.encode(contenu).length} >>\nstream\n${contenu}\nendstream`];
    let s = '%PDF-1.4\n', offs = [];
    objs.forEach((o, i) => { offs.push(enc.encode(s).length); s += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const x = enc.encode(s).length;
    s += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
    return s;
  }
  async function png(doc, pxmm = 20) {
    const L = lots(doc), b = cadre(doc, L), w = Math.ceil((b[2] - b[0]) * pxmm), h = Math.ceil((b[3] - b[1]) * pxmm);
    if (w * h > 120e6) throw new Error(tr('Image trop grande ({w} × {h} px) : baisse la résolution.', { w, h }));
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const x = cv.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.lineJoin = x.lineCap = 'round'; x.lineWidth = Math.max(1, pxmm * 0.1);
    for (const l of L) { x.beginPath(); l.polys.forEach(q => q.forEach(([a, c], i) => (i ? x.lineTo : x.moveTo).call(x, (a - b[0]) * pxmm, (b[3] - c) * pxmm)));
      if (l.rempli) { x.fillStyle = l.couleur; x.fill('evenodd'); } x.strokeStyle = l.couleur; x.stroke(); }
    return new Promise(ok => cv.toBlob(ok, 'image/png'));
  }

  window.VDOutils = { polygone, etoile, arc, code, polices, policesDuPoste, policeFichier, police, texte, retexter, contourTexte, opentypeP, clipper,
    booleen, decaler, decalages, versC, deC, region, aligner, symetrie, grouper, reseau, dxf, svg, pdf, eps, png, lots, aci };
})();
