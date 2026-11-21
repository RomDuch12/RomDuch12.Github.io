/* VectorDrive web : le document .vdz (même JSON que l'application de bureau, champs inconnus gardés),
   tracés (L lignes, C Bézier cubiques, Q coniques), transformations, formes de base, import, export et écriture .vdz.
   Les objets ne sont jamais modifiés en place : une modification rend un nouvel objet (annulation à bas coût). */
(function () {
  'use strict';
  const tr = (s, v) => (window.t ? window.t(s, v) : s);
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(16).slice(2) + Date.now().toString(16)).replace(/-/g, '');
  const COULEURS = ['#000000', '#e53935', '#1e88e5', '#43a047', '#fb8c00', '#8e24aa', '#00acc1', '#6d4c41'];

  /* ---------- document ---------- */
  function nouveau(l = 100, h = 50) {
    return { format: 'VectorDrive', version: 1,
      plate: { width: l, height: h, corner_radius: 0, material: '', x: 0, y: 0, visible: true, thickness: 0, margins: [0, 0, 0, 0] },
      tools: COULEURS.map((color, index) => ({ index, color, name: `${tr('Outil')} ${index + 1}`, width: 0 })),
      active: '', layers: [{ id: uid(), name: `${tr('Plan')} 1`, visible: true, locked: false, tool: 0, items: [] }], extra: {} };
  }
  function verifier(d) {
    if (!d || d.format !== 'VectorDrive') throw new Error(tr('Ce fichier n\'est pas un dessin VectorDrive (.vdz).'));
    d.layers = (d.layers || []).map(L => ({ visible: true, locked: false, tool: 0, items: [], ...L, id: L.id || uid() }));
    if (!d.layers.length) d.layers.push(nouveau().layers[0]);
    if (!d.tools || !d.tools.length) d.tools = nouveau().tools;
    d.extra = d.extra || {};
    return d;
  }

  /* ---------- tracés ---------- */
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  /* points d'un contour {closed, segs}, tolérance tol (mm) */
  function contourPts(c, tol = 0.05) {
    const out = [];
    for (const s of c.segs || []) {
      const k = s[0];
      if (!out.length) out.push([s[1], s[2]]);
      if (k === 'L') out.push([s[3], s[4]]);
      else if (k === 'C') {
        const p = [[s[1], s[2]], [s[3], s[4]], [s[5], s[6]], [s[7], s[8]]], L = dist(p[0], p[1]) + dist(p[1], p[2]) + dist(p[2], p[3]);
        const n = Math.max(2, Math.min(256, Math.ceil(Math.sqrt(L / tol))));
        for (let i = 1; i <= n; i++) { const t = i / n, u = 1 - t, a = u * u * u, b = 3 * u * u * t, cc = 3 * u * t * t, d = t * t * t;
          out.push([a * p[0][0] + b * p[1][0] + cc * p[2][0] + d * p[3][0], a * p[0][1] + b * p[1][1] + cc * p[2][1] + d * p[3][1]]); }
      } else if (k === 'Q') {
        const p = [[s[1], s[2]], [s[3], s[4]], [s[5], s[6]]], w = s[7] ?? 1, L = dist(p[0], p[1]) + dist(p[1], p[2]);
        const n = Math.max(2, Math.min(256, Math.ceil(Math.sqrt(L / tol) * 1.5)));
        for (let i = 1; i <= n; i++) { const t = i / n, u = 1 - t, a = u * u, b = 2 * w * u * t, cc = t * t, den = a + b + cc;
          out.push([(a * p[0][0] + b * p[1][0] + cc * p[2][0]) / den, (a * p[0][1] + b * p[1][1] + cc * p[2][1]) / den]); }
      }
    }
    if (c.closed && out.length > 1 && dist(out[0], out[out.length - 1]) > 1e-9) out.push(out[0].slice());
    return out;
  }
  /* tracé d'un objet (forme, contour d'un texte, enfants d'un groupe) */
  function contours(it) {
    if (it.kind === 'shape') return it.path || [];
    if (it.kind === 'text') return it.outline || [];
    if (it.kind === 'group') return (it.children || []).flatMap(contours);
    return [];
  }
  const cache = new WeakMap();
  function polys(it) {
    let p = cache.get(it); if (p) return p;
    p = contours(it).map(c => contourPts(c)).filter(q => q.length > 1);
    if (it.kind === 'image' && it.extra && it.extra.bbox) { const [x0, y0, x1, y1] = it.extra.bbox; p = [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]]; }
    cache.set(it, p); return p;
  }
  function boite(liste) {
    const b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const it of liste) for (const q of polys(it)) for (const [x, y] of q) { if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y; }
    return b[0] <= b[2] ? b : null;
  }

  /* ---------- transformations : m = [a, b, c, d, e, f], x' = a x + c y + e, y' = b x + d y + f ---------- */
  const appliquer = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  const compose = (m, o) => [m[0] * o[0] + m[2] * o[1], m[1] * o[0] + m[3] * o[1], m[0] * o[2] + m[2] * o[3], m[1] * o[2] + m[3] * o[3], m[0] * o[4] + m[2] * o[5] + m[4], m[1] * o[4] + m[3] * o[5] + m[5]];
  const translation = (dx, dy) => [1, 0, 0, 1, dx, dy];
  const echelle = (sx, sy, cx, cy) => [sx, 0, 0, sy, cx - sx * cx, cy - sy * cy];
  const rotation = (deg, cx, cy) => { const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); return [c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy]; };
  function segT(s, m) {
    const o = [s[0]], n = s[0] === 'L' ? 2 : s[0] === 'C' ? 4 : 3;
    for (let i = 0; i < n; i++) o.push(...appliquer(m, s[1 + 2 * i], s[2 + 2 * i]));
    if (s[0] === 'Q') o.push(s[7]);
    return o;
  }
  const pathT = (p, m) => p && p.map(c => ({ ...c, segs: c.segs.map(s => segT(s, m)) }));
  function transformer(it, m) {
    const o = { ...it };
    if (it.kind === 'shape') o.path = pathT(it.path, m);
    else if (it.kind === 'text') { o.matrix = compose(m, it.matrix || [1, 0, 0, 1, 0, 0]); o.outline = pathT(it.outline, m); }
    else if (it.kind === 'group') o.children = it.children.map(c => transformer(c, m));
    else if (it.kind === 'image') o.matrix = compose(m, it.matrix || [1, 0, 0, 1, 0, 0]);
    if (it.extra && it.extra.solide) {                                    // volume 3D : sa matrice 4×4 suit le plan (XY)
      const s = typeof it.extra.solide === 'string' ? JSON.parse(it.extra.solide) : it.extra.solide;
      const M = s.m && s.m.length === 16 ? s.m : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
      const A = [m[0], m[2], 0, m[4], m[1], m[3], 0, m[5], 0, 0, 1, 0, 0, 0, 0, 1], R = new Array(16).fill(0);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) R[4 * i + j] += A[4 * i + k] * M[4 * k + j];
      o.extra = { ...it.extra, solide: { ...s, m: R } };
    }
    return o;
  }
  const copie = it => ({ ...transformer(it, [1, 0, 0, 1, 0, 0]), id: uid(), ...(it.kind === 'group' ? { children: it.children.map(copie) } : {}) });

  /* ---------- formes ---------- */
  const objet = (path, outil, extra = {}) => ({ id: uid(), name: '', tool: outil, visible: true, locked: false, extra, kind: 'shape', path, filled: false });
  const ligne = (a, b) => ['L', a[0], a[1], b[0], b[1]];
  function polyligne(pts, ferme, outil = 0) {
    const segs = []; for (let i = 0; i < pts.length - 1; i++) segs.push(ligne(pts[i], pts[i + 1]));
    if (ferme && pts.length > 2 && dist(pts[0], pts[pts.length - 1]) > 1e-9) segs.push(ligne(pts[pts.length - 1], pts[0]));
    return objet([{ closed: !!ferme, segs }], outil);
  }
  function rectangle(x0, y0, x1, y1, r = 0, outil = 0) {
    const [a, b, c, d] = [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)];
    r = Math.max(0, Math.min(r, (c - a) / 2, (d - b) / 2));
    if (!r) return polyligne([[a, b], [c, b], [c, d], [a, d]], true, outil);
    const k = r * 0.5522847498, segs = [
      ligne([a + r, b], [c - r, b]), ['C', c - r, b, c - r + k, b, c, b + r - k, c, b + r],
      ligne([c, b + r], [c, d - r]), ['C', c, d - r, c, d - r + k, c - r + k, d, c - r, d],
      ligne([c - r, d], [a + r, d]), ['C', a + r, d, a + r - k, d, a, d - r + k, a, d - r],
      ligne([a, d - r], [a, b + r]), ['C', a, b + r, a, b + r - k, a + r - k, b, a + r, b]];
    return objet([{ closed: true, segs }], outil);
  }
  function ellipse(cx, cy, rx, ry, outil = 0) {
    const kx = rx * 0.5522847498, ky = ry * 0.5522847498;
    const segs = [['C', cx + rx, cy, cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry], ['C', cx, cy + ry, cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy],
      ['C', cx - rx, cy, cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry], ['C', cx, cy - ry, cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy]];
    return objet([{ closed: true, segs }], outil);
  }
  /* objets lus par Vecteurs.read (DXF, SVG, PDF, EPS, AI, STEP) : un calque par calque source */
  function importer(doc, r, nom) {
    const parCalque = new Map();
    for (const it of r.items) {
      const k = it.layer || nom || tr('Import'); if (!parCalque.has(k)) parCalque.set(k, []);
      const p = it.poly, ferme = p.length > 2 && dist(p[0], p[p.length - 1]) < 1e-9;
      parCalque.get(k).push(polyligne(ferme ? p.slice(0, -1) : p, ferme, 0));
    }
    return { ...doc, layers: [...doc.layers, ...[...parCalque].map(([name, items]) => ({ id: uid(), name, visible: true, locked: false, tool: 0, items }))] };
  }

  /* ---------- export : tous les objets visibles des calques visibles ---------- */
  function visibles(doc) { return doc.layers.filter(L => L.visible).flatMap(L => L.items.filter(i => i.visible !== false)); }
  const toutesPolys = (doc, liste) => (liste || visibles(doc)).flatMap(polys);

  /* ---------- écriture .vdz : zip (deflate) avec document.json et mimetype ---------- */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = u8 => { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const deflate = u8 => new Response(new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer().then(b => new Uint8Array(b));
  async function zip(fichiers) {
    const enc = new TextEncoder(), parts = [], central = [];
    let off = 0;
    for (const f of fichiers) {
      const nom = enc.encode(f.nom), brut = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(brut);
      const meth = f.compresser === false ? 0 : 8, data = meth ? await deflate(brut) : brut;
      const h = new DataView(new ArrayBuffer(30));
      [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, meth, 2], [10, 0, 2], [12, 0x21, 2], [14, crc, 4], [18, data.length, 4], [22, brut.length, 4], [26, nom.length, 2], [28, 0, 2]]
        .forEach(([o, v, n]) => (n === 4 ? h.setUint32(o, v, true) : h.setUint16(o, v, true)));
      const c = new DataView(new ArrayBuffer(46));
      [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, meth, 2], [12, 0, 2], [14, 0x21, 2], [16, crc, 4], [20, data.length, 4], [24, brut.length, 4], [28, nom.length, 2],
        [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, off, 4]].forEach(([o, v, n]) => (n === 4 ? c.setUint32(o, v, true) : c.setUint16(o, v, true)));
      parts.push(new Uint8Array(h.buffer), nom, data); central.push(new Uint8Array(c.buffer), nom);
      off += 30 + nom.length + data.length;
    }
    const taille = central.reduce((a, b) => a + b.length, 0), e = new DataView(new ArrayBuffer(22));
    [[0, 0x06054b50, 4], [8, fichiers.length, 2], [10, fichiers.length, 2], [12, taille, 4], [16, off, 4]].forEach(([o, v, n]) => (n === 4 ? e.setUint32(o, v, true) : e.setUint16(o, v, true)));
    const tout = [...parts, ...central, new Uint8Array(e.buffer)], out = new Uint8Array(tout.reduce((a, b) => a + b.length, 0));
    let p = 0; for (const u of tout) { out.set(u, p); p += u.length; }
    return out;
  }
  const versVDZ = doc => zip([{ nom: 'document.json', data: JSON.stringify(doc) }, { nom: 'mimetype', data: 'application/x-vectordrive' }]);
  async function lireVDZ(buffer) {
    const z = await VDZ.dezip(new Uint8Array(buffer));
    if (!z['document.json']) throw new Error(tr('Ce fichier n\'est pas un dessin VectorDrive (.vdz).'));
    return verifier(JSON.parse(new TextDecoder().decode(await z['document.json'])));
  }

  /* ---------- sélection : distance d'un point à un objet (mm) ; un objet rempli est touché à l'intérieur ---------- */
  function distance(it, x, y) {
    let d = Infinity, dedans = false;
    for (const q of polys(it)) {
      for (let i = 0; i < q.length - 1; i++) {
        const [ax, ay] = q[i], [bx, by] = q[i + 1], vx = bx - ax, vy = by - ay, l = vx * vx + vy * vy;
        const t = l ? Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / l)) : 0;
        d = Math.min(d, Math.hypot(x - ax - t * vx, y - ay - t * vy));
        if ((ay > y) !== (by > y) && x < ax + (y - ay) * vx / (vy || 1e-12)) dedans = !dedans;
      }
    }
    return (it.filled || it.kind === 'text') && dedans ? 0 : d;
  }

  window.VDWeb = { nouveau, verifier, contourPts, contours, polys, boite, appliquer, compose, translation, echelle, rotation, transformer, copie,
    polyligne, rectangle, ellipse, importer, visibles, toutesPolys, zip, crc32, versVDZ, lireVDZ, distance, uid, COULEURS };
})();
