/* TauDrive web – dessin, trajectoires et job laser (ISO + CLJOB), d'après TauDrive (PySide6).
   Tout est calculé dans le navigateur : rien n'est envoyé. Unités : mm, Y vers le haut, champ centré sur l'origine. */
(function () {
  'use strict';
  const tr = (s, v) => (window.t ? window.t(s, v) : s);
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nf = (n, d = 3) => (window.I18N ? I18N.fmt(+(+n).toFixed(d)) : String(+(+n).toFixed(d)));
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const ST = () => (window.Stockage && Stockage.actif() ? Stockage : null);

  /* ======================= géométrie ======================= */
  const G = {
    rotate(p, deg, cx = 0, cy = 0) {
      if (!deg) return p;
      const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
      return p.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]);
    },
    translate: (p, dx, dy) => p.map(([x, y]) => [x + dx, y + dy]),
    scaleXY: (p, fx, fy) => p.map(([x, y]) => [x * fx, y * fy]),
    bounds(polys) {
      let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
      for (const p of polys) for (const [x, y] of p) { if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y; }
      return x1 === Infinity ? null : [x1, y1, x2, y2];
    },
    rect(w, h, cx = 0, cy = 0) { const a = w / 2, b = h / 2; return [[cx - a, cy - b], [cx + a, cy - b], [cx + a, cy + b], [cx - a, cy + b], [cx - a, cy - b]]; },
    circle(r, cx = 0, cy = 0, tol = 0.005) {
      const n = Math.max(24, Math.min(720, Math.ceil(Math.PI / Math.acos(Math.max(-1, 1 - tol / Math.max(r, 1e-6))))));
      const out = []; for (let k = 0; k <= n; k++) { const a = 2 * Math.PI * k / n; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
      out[n] = out[0].slice(); return out;
    },
    closed: p => p.length > 2 && Math.abs(p[0][0] - p[p.length - 1][0]) < 1e-9 && Math.abs(p[0][1] - p[p.length - 1][1]) < 1e-9,
    length(p) { let s = 0; for (let i = 1; i < p.length; i++) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return s; },
    area(p) {
      const q = G.closed(p) ? p.slice(0, -1) : p; let s = 0;
      for (let i = 0; i < q.length; i++) { const [x, y] = q[i], [nx, ny] = q[(i + 1) % q.length]; s += x * ny - nx * y; }
      return s / 2;
    },
    inside([x, y], poly) {
      const q = G.closed(poly) ? poly.slice(0, -1) : poly; let d = false;
      for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
        const [ax, ay] = q[i], [bx, by] = q[j];
        if ((ay > y) !== (by > y) && ax + (y - ay) / (by - ay) * (bx - ax) > x) d = !d;
      }
      return d;
    },
    /* hachurage pair-impair, balayage alterné */
    hatch(contours, step, angle = 0, off = 0) {
      if (!(step > 0) || !contours.length) return [];
      const work = contours.map(c => G.rotate(c, -angle)), b = G.bounds(work); if (!b) return [];
      const [, y1, , y2] = b, segs = [], n = Math.floor((y2 - y1) / step) + 1;
      const edges = [];
      for (const c of work) { const p = G.closed(c) ? c : c.concat([c[0]]); for (let i = 1; i < p.length; i++) if (p[i - 1][1] !== p[i][1]) edges.push([p[i - 1][0], p[i - 1][1], p[i][0], p[i][1]]); }
      for (let i = 0; i <= n; i++) {
        const y = y1 + off + i * step; if (y > y2) break;
        const xs = [];
        for (const [ax, ay, bx, by] of edges) { const lo = Math.min(ay, by), hi = Math.max(ay, by); if (lo <= y && y < hi) xs.push(ax + (y - ay) * (bx - ax) / (by - ay)); }
        xs.sort((a, c) => a - c);
        let row = []; for (let k = 0; k + 1 < xs.length; k += 2) if (xs[k + 1] - xs[k] > 1e-9) row.push([[xs[k], y], [xs[k + 1], y]]);
        if (i % 2) row = row.reverse().map(s => s.reverse());
        segs.push(...row);
      }
      return segs.map(s => G.rotate(s, angle));
    }
  };

  /* ----- décalage exact (onglet), élagage des boucles et recousage ----- */
  const MITER = 4, OFF_TOL = 0.92, STITCH = 6;
  const unit = (x, y) => { const l = Math.hypot(x, y); return l > 1e-12 ? [x / l, y / l] : null; };
  function offsetPoly(poly, off) {
    if (poly.length < 2) return [];
    const closed = G.closed(poly), pts = closed ? poly.slice(0, -1) : poly, n = pts.length, out = [];
    for (let i = 0; i < n; i++) {
      const [x, y] = pts[i], ns = [];
      if (i > 0 || closed) { const [ax, ay] = pts[(i - 1 + n) % n]; ns.push(unit(y - ay, ax - x)); }
      if (i < n - 1 || closed) { const [bx, by] = pts[(i + 1) % n]; ns.push(unit(by - y, x - bx)); }
      const v = ns.filter(Boolean);
      if (!v.length) { out.push([x, y]); continue; }
      if (v.length === 1) { out.push([x + v[0][0] * off, y + v[0][1] * off]); continue; }
      const [[ax, ay], [bx, by]] = v, den = 1 + ax * bx + ay * by;
      if (den <= 1 / MITER) { const m = unit(ax + bx, ay + by) || [ax, ay]; out.push([x + m[0] * off * MITER, y + m[1] * off * MITER]); continue; }
      out.push([x + (ax + bx) / den * off, y + (ay + by) / den * off]);
    }
    if (closed) out.push(out[0].slice());
    return out;
  }
  function segDist(px, py, [ax, ay], [bx, by]) {
    const dx = bx - ax, dy = by - ay, c = dx * dx + dy * dy;
    if (c <= 1e-18) return Math.hypot(px - ax, py - ay);
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / c));
    return Math.hypot(px - ax - dx * t, py - ay - dy * t);
  }
  function segGrid(contours, cell) {
    cell = Math.max(cell, 1e-6); const cases = new Map();
    for (const p of contours) for (let i = 1; i < p.length; i++) {
      const a = p[i - 1], b = p[i];
      for (let cx = Math.floor(Math.min(a[0], b[0]) / cell); cx <= Math.floor(Math.max(a[0], b[0]) / cell); cx++)
        for (let cy = Math.floor(Math.min(a[1], b[1]) / cell); cy <= Math.floor(Math.max(a[1], b[1]) / cell); cy++) {
          const k = cx + ',' + cy; if (!cases.has(k)) cases.set(k, []); cases.get(k).push([a, b]);
        }
    }
    return { dist(x, y, cap) {
      const cx = Math.floor(x / cell), cy = Math.floor(y / cell), r = Math.max(1, Math.floor(cap / cell) + 1); let best = cap;
      for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) { const l = cases.get((cx + a) + ',' + (cy + b)); if (l) for (const [p, q] of l) { const d = segDist(x, y, p, q); if (d < best) best = d; } }
      return best;
    } };
  }
  function restitch(parts, want) {
    if (!parts.length) return [];
    const jump = Math.max(want * STITCH, 1e-6), gap = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
    const pieces = parts.map(p => p.slice());
    if (pieces.length > 1 && gap(pieces[pieces.length - 1][pieces[pieces.length - 1].length - 1], pieces[0][0]) <= jump) pieces[0] = pieces.pop().concat(pieces[0]);
    const out = []; let cur = [];
    for (const m of pieces) { if (!cur.length) cur = m; else if (gap(cur[cur.length - 1], m[0]) <= jump) cur = cur.concat(m); else { out.push(cur); cur = m; } }
    if (cur.length) out.push(cur);
    return out.filter(c => c.length >= 3).map(c => (gap(c[0], c[c.length - 1]) > 1e-9 ? c.concat([c[0].slice()]) : c));
  }
  function pruneOffset(source, dec, dist) {
    if (!dec || dec.length < 2 || !dist) return dec ? [dec] : [];
    const want = Math.abs(dist), seuil = want * OFF_TOL, step = Math.max(want / 3, 1e-4), grid = segGrid(source, Math.max(want, step));
    const parts = []; let cur = [];
    for (let i = 1; i < dec.length; i++) {
      const [x1, y1] = dec[i - 1], [x2, y2] = dec[i], n = Math.max(1, Math.floor(Math.hypot(x2 - x1, y2 - y1) / step));
      for (let k = 0; k <= n; k++) {
        const t = k / n, x = x1 + (x2 - x1) * t, y = y1 + (y2 - y1) * t;
        if (grid.dist(x, y, want * 1.5) >= seuil) { if (!cur.length || k === n || cur.length === 1) cur.push([x, y]); }
        else if (cur.length) { if (cur.length > 1) parts.push(cur); cur = []; }
      }
    }
    if (cur.length > 1) parts.push(cur);
    if (parts.length === 1 && parts[0].length >= dec.length - 1) return [dec];
    return restitch(parts.filter(m => G.length(m) > step), want);
  }
  function offsetContours(contours, dist) {
    if (!dist || !contours.length) return contours.slice();
    const closedOnes = contours.filter(c => c.length >= 4), out = [];
    for (const poly of contours) {
      if (poly.length < 4 || Math.abs(G.area(poly)) < 1e-12) { out.push(poly); continue; }
      const hollow = closedOnes.filter(o => o !== poly && G.inside(poly[0], o)).length % 2 === 1;
      const grow = (dist > 0) !== hollow, start = Math.abs(G.area(poly));
      const cand = [offsetPoly(poly, Math.abs(dist)), offsetPoly(poly, -Math.abs(dist))];
      const ar = cand.map(c => (c.length >= 4 ? Math.abs(G.area(c)) : -1));
      const i = grow ? (ar[0] > ar[1] ? 0 : 1) : (ar[0] < ar[1] ? 0 : 1);
      if (ar[i] < 0 || (!grow && ar[i] >= start)) continue;
      out.push(...pruneOffset(contours, cand[i], dist));
    }
    return out;
  }
  function thicken(polys, width, step) {
    if (!(width > 0) || !(step > 0)) return polys;
    const count = Math.floor(width / step / 2); if (count <= 0) return polys;
    const add = [];
    for (let i = 1; i <= count; i++) for (const p of polys) for (const s of [1, -1]) { const q = offsetPoly(p, s * i * step); if (q.length) add.push(q); }
    return polys.concat(add);
  }
  function wobble(polys, amp, pitch, shape) {
    if (shape === 'none' || !(amp > 0) || !(pitch > 0)) return polys;
    const off = ph => (shape === 'circle' ? [amp * Math.sin(ph), amp * Math.cos(ph)] : shape === 'eight' ? [amp * Math.sin(2 * ph), amp * Math.cos(ph)] : [0, amp * Math.cos(ph)]);
    return polys.map(poly => {
      if (poly.length < 2) return poly;
      const d = pitch / 16, out = []; let run = 0;
      for (let i = 1; i < poly.length; i++) {
        const [x1, y1] = poly[i - 1], [x2, y2] = poly[i], dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy); if (L <= 1e-12) continue;
        const tx = dx / L, ty = dy / L, n = Math.max(1, Math.ceil(L / d));
        for (let k = 0; k < n; k++) { const [le, ne] = off(2 * Math.PI * (run + L * k / n) / pitch); out.push([x1 + dx * k / n + tx * le - ty * ne, y1 + dy * k / n + ty * le + tx * ne]); }
        run += L;
      }
      if (!out.length) return poly;
      out[0] = poly[0].slice(); out.push(poly[poly.length - 1].slice()); return out;
    });
  }
  /* ordonnancement au plus proche voisin, inversion des tracés ouverts, grille de recherche */
  function nearest(polys, start = [0, 0]) {
    const items = polys.filter(p => p.length >= 2); if (items.length < 2) return items;
    const ent = []; items.forEach((p, i) => { ent.push([p[0][0], p[0][1], i, false]); if (!G.closed(p)) ent.push([p[p.length - 1][0], p[p.length - 1][1], i, true]); });
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of ent) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const span = Math.max(x1 - x0, y1 - y0), cell = span <= 1e-12 ? 1 : span / Math.max(1, Math.floor(Math.sqrt(ent.length)));
    const grid = new Map(), key = (a, b) => a + ',' + b;
    ent.forEach((e, k) => { const g = key(Math.floor((e[0] - x0) / cell), Math.floor((e[1] - y0) / cell)); if (!grid.has(g)) grid.set(g, []); grid.get(g).push(k); });
    const maxRing = Math.ceil(span / cell) + 2, used = new Array(items.length).fill(false), out = []; let cur = start;
    for (let n = 0; n < items.length; n++) {
      const cx = Math.floor((cur[0] - x0) / cell), cy = Math.floor((cur[1] - y0) / cell); let best = -1, bd = Infinity;
      for (let r = 0; r <= maxRing + Math.ceil(Math.hypot(cx, cy)); r++) {
        for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
          if (Math.max(Math.abs(a), Math.abs(b)) !== r) continue;
          const l = grid.get(key(cx + a, cy + b)); if (!l) continue;
          for (const k of l) { const e = ent[k]; if (used[e[2]]) continue; const d = Math.hypot(e[0] - cur[0], e[1] - cur[1]); if (d < bd) { bd = d; best = k; } }
        }
        if (best >= 0 && bd <= r * cell) break;
      }
      if (best < 0) break;
      const e = ent[best]; used[e[2]] = true; const p = e[3] ? items[e[2]].slice().reverse() : items[e[2]]; out.push(p); cur = p[p.length - 1];
    }
    items.forEach((p, i) => { if (!used[i]) out.push(p); });
    return out;
  }

  /* ======================= polices (opentype.js) ======================= */
  const FS = 'https://cdn.jsdelivr.net/npm/@fontsource/';
  const FONTS = [
    { id: 'roboto', nom: 'Roboto', f: ['roboto@5/files/roboto-latin-400-normal', 'roboto@5/files/roboto-latin-ext-400-normal', 'roboto@5/files/roboto-cyrillic-400-normal'] },
    { id: 'roboto-b', nom: 'Roboto Bold', f: ['roboto@5/files/roboto-latin-700-normal', 'roboto@5/files/roboto-latin-ext-700-normal', 'roboto@5/files/roboto-cyrillic-700-normal'] },
    { id: 'barlow', nom: 'Barlow SemiBold', f: ['barlow@5/files/barlow-latin-600-normal', 'barlow@5/files/barlow-latin-ext-600-normal'] },
    { id: 'oswald', nom: 'Oswald', f: ['oswald@5/files/oswald-latin-500-normal', 'oswald@5/files/oswald-latin-ext-500-normal', 'oswald@5/files/oswald-cyrillic-500-normal'] },
    { id: 'mono', nom: 'Roboto Mono', f: ['roboto-mono@5/files/roboto-mono-latin-400-normal', 'roboto-mono@5/files/roboto-mono-latin-ext-400-normal', 'roboto-mono@5/files/roboto-mono-cyrillic-400-normal'] },
    { id: 'playfair', nom: 'Playfair Display', f: ['playfair-display@5/files/playfair-display-latin-700-normal', 'playfair-display@5/files/playfair-display-latin-ext-700-normal', 'playfair-display@5/files/playfair-display-cyrillic-700-normal'] },
    { id: 'vibes', nom: 'Great Vibes', f: ['great-vibes@5/files/great-vibes-latin-400-normal', 'great-vibes@5/files/great-vibes-latin-ext-400-normal', 'great-vibes@5/files/great-vibes-cyrillic-400-normal'] },
    { id: 'stencil', nom: 'Stardos Stencil', f: ['stardos-stencil@5/files/stardos-stencil-latin-700-normal'] }
  ];
  const fontCache = {}, fontWait = {};
  function fontFor(id) {
    if (fontCache[id]) return fontCache[id];
    if (!fontWait[id] && window.opentype) {
      const def = FONTS.find(f => f.id === id);
      if (!def) return null;
      fontWait[id] = Promise.all(def.f.map(p => fetch(FS + p + '.woff').then(r => (r.ok ? r.arrayBuffer() : null)).then(b => (b ? opentype.parse(b) : null)).catch(() => null)))
        .then(list => { fontCache[id] = list.filter(Boolean); clearCache(); redraw(); });
    }
    return null;
  }
  function flatten(cmds, scale, tol) {
    const out = []; let cur = null, sx = 0, sy = 0, px = 0, py = 0;
    const P = (x, y) => [x * scale, -y * scale];
    const seg = (n, f) => { for (let k = 1; k <= n; k++) cur.push(P(...f(k / n))); };
    for (const c of cmds) {
      if (c.type === 'M') { if (cur && cur.length > 1) out.push(cur); cur = [P(c.x, c.y)]; sx = px = c.x; sy = py = c.y; }
      else if (c.type === 'L') { cur.push(P(c.x, c.y)); px = c.x; py = c.y; }
      else if (c.type === 'Q') {
        const n = Math.max(2, Math.min(24, Math.ceil(Math.hypot(c.x - px, c.y - py) * scale / tol / 8))), x0 = px, y0 = py;
        seg(n, t => [(1 - t) ** 2 * x0 + 2 * (1 - t) * t * c.x1 + t * t * c.x, (1 - t) ** 2 * y0 + 2 * (1 - t) * t * c.y1 + t * t * c.y]); px = c.x; py = c.y;
      } else if (c.type === 'C') {
        const n = Math.max(3, Math.min(32, Math.ceil(Math.hypot(c.x - px, c.y - py) * scale / tol / 8))), x0 = px, y0 = py;
        seg(n, t => { const u = 1 - t; return [u ** 3 * x0 + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t ** 3 * c.x, u ** 3 * y0 + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t ** 3 * c.y]; }); px = c.x; py = c.y;
      } else if (c.type === 'Z') { if (cur) { cur.push(P(sx, sy)); if (cur.length > 2) out.push(cur); cur = null; } }
    }
    if (cur && cur.length > 1) out.push(cur);
    return out;
  }
  function textLine(fonts, line, size) {
    const main = fonts[0], upem = main.unitsPerEm, cap = (main.tables.os2 && main.tables.os2.sCapHeight) || main.ascender * 0.7;
    const scale = size / cap, contours = []; let pen = 0;
    for (const ch of line) {
      const f = fonts.find(ft => { const g = ft.charToGlyph(ch); return g && g.index > 0; });
      if (!f) { pen += upem * 0.3; continue; }
      const g = f.charToGlyph(ch), k = upem / f.unitsPerEm;
      const cs = flatten(g.getPath(0, 0, f.unitsPerEm).commands, scale * k, 0.02);
      cs.forEach(c => contours.push(c.map(([x, y]) => [x + pen * scale, y])));
      pen += g.advanceWidth * k;
    }
    return { contours, width: pen * scale };
  }
  function textContours(s) {
    const fonts = s.font === 'user' ? userFont : fontFor(s.font || 'roboto');
    if (!fonts || !fonts.length) return null;
    const lines = expand(s.text || '').split('\n'); if (!lines.some(l => l.trim())) return [];
    const step = s.size * (s.spacing || 1.4), laid = lines.map(l => textLine(fonts, l, s.size)), bw = Math.max(...laid.map(l => l.width));
    let placed = [];
    laid.forEach((l, i) => {
      if (!lines[i].trim()) return;
      const dx = s.align === 'center' ? (bw - l.width) / 2 - bw / 2 : s.align === 'right' ? -l.width : 0;
      placed.push(...l.contours.map(c => c.map(([x, y]) => [x + dx, y - i * step])));
    });
    if (!placed.length) return [];
    if (s.valign !== 'baseline') {
      const b = G.bounds(placed), o = s.valign === 'top' ? -b[3] : s.valign === 'bottom' ? -b[1] : -(b[1] + b[3]) / 2;
      placed = placed.map(c => G.translate(c, 0, o));
    }
    if (Math.abs((s.stretch || 1) - 1) > 1e-9) placed = placed.map(c => G.scaleXY(c, s.stretch, 1));
    return placed;
  }
  let userFont = null, userFontName = '';
  function expand(text) {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    return text.replace(/\{date\}/g, `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`).replace(/\{annee\}|\{year\}/g, d.getFullYear())
      .replace(/\{heure\}|\{time\}/g, `${p(d.getHours())}:${p(d.getMinutes())}`);
  }

  /* lecture des dessins : voir vecteurs.js */
  const joinPolys = polys => window.Vecteurs.join(polys);

  /* ======================= modèle ======================= */
  const RAPID = 420000;                                   // déplacement à vide de la tête galvo, mm/min
  const newId = () => Math.random().toString(36).slice(2, 10);
  const defRecipe = () => ({ name: tr('Process par défaut'), power: 100, freq: 80, pulse: 100, speed: 40000, passes: 1, depthMode: 'step', depthStep: 0, depthTotal: 0,
    hatch: 0, hatchAngle: 0, hatchStep: 0, cross: false, inset: 0, wobble: 'none', wobAmp: 0, wobPitch: 0, tool: 1 });
  const defDoc = () => ({ name: 'gravure', plateW: 100, plateH: 100, wcx: 50, wcy: 50, fieldW: 110, fieldH: 110, machineDir: 'C:\\inciwin\\cl_iso', optimize: true, group: false, shapes: [] });
  const base = type => ({ id: newId(), type, name: '', x: 0, y: 0, rot: 0, visible: true, frame: 'none', frameMargin: 2, frameW: 0, frameH: 0, offset: 0, lineWidth: 0, lineStep: 0, p: Object.assign({}, lastRecipe || defRecipe()) });
  const MAKE = {
    rect: () => Object.assign(base('rect'), { w: 30, h: 15 }),
    ellipse: () => Object.assign(base('ellipse'), { w: 20, h: 20 }),
    text: () => Object.assign(base('text'), { text: 'TauDrive', size: 6, font: 'roboto', align: 'center', valign: 'middle', spacing: 1.4, stretch: 1 }),
    line: () => Object.assign(base('path'), { polys: [[[-15, 0], [15, 0]]], source: tr('segment') }),
    code: () => Object.assign(base('code'), { data: 'RomDuch {date}', dm: 'square', module: 0.5, fillStep: 0 })
  };
  const TYPE_NOM = { rect: 'Rectangle', ellipse: 'Ellipse', text: 'Texte', path: 'Tracé', code: 'DataMatrix' };
  const shapeName = s => s.name || (s.type === 'text' ? `« ${(s.text || '').split('\n')[0].slice(0, 24)} »` : s.type === 'path' ? (s.source || tr('Tracé'))
    : s.type === 'code' ? `DataMatrix « ${expand(s.data || '').slice(0, 20)} »` : tr(TYPE_NOM[s.type]));

  let doc = defDoc(), procs = [], lastRecipe = null, sel = null, undo = [], redo = [];

  /* ----- trajectoires d'une forme (repère local, rotation comprise) ----- */
  function ownContours(s) {
    if (s.type === 'rect') return [G.rect(s.w, s.h)];
    if (s.type === 'ellipse') { const r = Math.max(s.w, s.h) / 2; return r > 0 ? [G.scaleXY(G.circle(r), s.w / (2 * r), s.h / (2 * r))] : []; }
    if (s.type === 'path') return s.polys.map(p => p.slice());
    if (s.type === 'text') return textContours(s);
    if (s.type === 'code') return codeContours(s);
    return [];
  }
  /* DataMatrix : frontière des modules sombres (arêtes réellement frontalières seulement), centrée */
  const codeErr = {};
  function codeMatrix(s) {
    try { delete codeErr[s.id]; return DataMatrix.encode(expand(s.data || ''), s.dm || 'square'); }
    catch (x) { codeErr[s.id] = x.message; return null; }
  }
  function codeContours(s) {
    const M = codeMatrix(s); if (!M) return [];
    const rows = M.length, cols = M[0].length, m = Math.max(0.01, +s.module || 0.5), dark = (r, c) => r >= 0 && c >= 0 && r < rows && c < cols && M[r][c];
    const edges = new Map(), add = (a, b) => { const k = a.join(','); if (!edges.has(k)) edges.set(k, []); edges.get(k).push(b); };
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (!M[r][c]) continue;                             // sommets (colonne, ligne), matière à gauche en Y vers le haut
      if (!dark(r + 1, c)) add([c, r + 1], [c + 1, r + 1]);
      if (!dark(r, c + 1)) add([c + 1, r + 1], [c + 1, r]);
      if (!dark(r - 1, c)) add([c + 1, r], [c, r]);
      if (!dark(r, c - 1)) add([c, r], [c, r + 1]);
    }
    const W = (i, j) => [(i - cols / 2) * m, (rows / 2 - j) * m], loops = [];
    for (const [k0, l0] of edges) {
      while (l0.length) {
        const start = k0.split(',').map(Number), pts = [start]; let cur = l0.pop();
        for (let guard = 0; guard < 1e6; guard++) {
          pts.push(cur); const key = cur.join(',');
          if (key === k0) break;
          const l = edges.get(key); if (!l || !l.length) break; cur = l.pop();
        }
        const simp = pts.filter((p, i) => i === 0 || i === pts.length - 1 || !(((pts[i - 1][0] === p[0]) && (p[0] === pts[i + 1][0])) || ((pts[i - 1][1] === p[1]) && (p[1] === pts[i + 1][1]))));
        loops.push(simp.map(([i, j]) => W(i, j)));
      }
    }
    return loops;
  }
  function frameOf(s, contours) {
    if (!['rect', 'circle'].includes(s.frame) || !contours.length) return null;
    const b = G.bounds(contours); if (!b) return null;
    const [x1, y1, x2, y2] = b, cx = (x1 + x2) / 2, cy = (y1 + y2) / 2, m = Math.max(0, +s.frameMargin || 0);
    if (s.frame === 'circle') return G.circle(s.frameW > 0 ? s.frameW / 2 : Math.hypot(x2 - x1, y2 - y1) / 2 + m, cx, cy);
    return G.rect(s.frameW > 0 ? s.frameW : x2 - x1 + 2 * m, s.frameH > 0 ? s.frameH : y2 - y1 + 2 * m, cx, cy);
  }
  function shapeContours(s) {
    const own = ownContours(s); if (!own) return null;
    const fr = frameOf(s, own), dec = offsetContours(own, +s.offset || 0);
    return fr ? [fr].concat(dec) : dec;
  }
  function fill(s, contours, pass = 0) {
    const r = s.p;
    if (s.type === 'code') {                              // un code se grave plein, quelle que soit la process
      const st = +s.fillStep > 0 ? +s.fillStep : r.hatch > 0 ? +r.hatch : 0.05;
      return contours.length ? G.hatch(contours, st, 0, st / 2) : [];
    }
    if (!(r.hatch > 0) || !contours.length) return [];
    let zone = contours; if (r.inset > 0) { const z = offsetContours(contours, -Math.abs(r.inset)); if (z.length) zone = z; }
    const a = (+r.hatchAngle || 0) + pass * (+r.hatchStep || 0);
    let h = G.hatch(zone, +r.hatch, a); if (r.cross) h = h.concat(G.hatch(zone, +r.hatch, a + 90));
    return h;
  }
  const CACHE = new Map();
  function clearCache() { CACHE.clear(); }
  function local(s, pass = 0) {
    const k = JSON.stringify([s.type, s.w, s.h, s.text, s.size, s.font, s.align, s.valign, s.spacing, s.stretch, s.data, s.dm, s.module, s.fillStep, s.type === 'path' ? s.id + ':' + s.rev : 0,
      s.frame, s.frameMargin, s.frameW, s.frameH, s.offset, s.lineWidth, s.lineStep, s.rot, s.p, pass]);
    if (CACHE.has(k)) return CACHE.get(k);
    const c = shapeContours(s); if (c === null) return null;                // police en cours de chargement
    let polys = c.concat(fill(s, c, pass));
    if (s.lineWidth > 0) polys = thicken(polys, +s.lineWidth, +s.lineStep || +s.p.hatch || 0.05);
    polys = wobble(polys, +s.p.wobAmp, +s.p.wobPitch, s.p.wobble);
    const res = { polys: polys.map(p => G.rotate(p, +s.rot || 0)), nc: c.length, contours: c.map(p => G.rotate(p, +s.rot || 0)) };
    if (CACHE.size > 400) CACHE.delete(CACHE.keys().next().value);
    CACHE.set(k, res); return res;
  }
  const placed = (s, pass = 0) => { const l = local(s, pass); return l ? l.polys.map(p => G.translate(p, +s.x, +s.y)) : []; };
  function extent(s) { const l = local(s); if (!l || !l.contours.length) return null; const b = G.bounds(l.contours); return [b[0] + +s.x, b[1] + +s.y, b[2] + +s.x, b[3] + +s.y]; }
  const depthStep = r => (r.depthMode === 'total' ? (r.passes <= 1 ? 0 : Math.max(0, +r.depthTotal) / (r.passes - 1)) : Math.max(0, +r.depthStep || 0));
  const passAngles = r => { const n = Math.max(1, r.passes | 0), st = +r.hatchStep || 0, b = +r.hatchAngle || 0; if (n <= 1 || !st || !(r.hatch > 0)) return [b];
    const seen = new Set(), out = []; for (let i = 0; i < n; i++) { const k = (((b + i * st) % 180) + 180) % 180; if (!seen.has(k.toFixed(3))) { seen.add(k.toFixed(3)); out.push(i); } } return out; };

  /* ----- passes du job ----- */
  function buildPasses() {
    const shapes = doc.shapes.filter(s => s.visible), out = []; let cursor = [0, 0];
    const baseP = [];
    if (doc.group) {
      const groups = new Map();
      for (const s of shapes) { const pl = placed(s); if (!pl.length) continue; const k = JSON.stringify(s.p);
        if (!groups.has(k)) groups.set(k, { recipe: s.p, polys: [], name: s.p.name + ' ' + tr('(groupé)'), ids: [] }); const g = groups.get(k); g.polys.push(...pl); g.ids.push(s.id); }
      baseP.push(...groups.values());
    } else for (const s of shapes) { const pl = placed(s); if (pl.length) baseP.push({ recipe: s.p, polys: pl, name: shapeName(s), ids: [s.id], shape: s }); }
    for (const b of baseP) {
      const r = b.recipe, n = Math.max(1, r.passes | 0), turn = (+r.hatchStep || 0) && r.hatch > 0;
      for (let i = 0; i < n; i++) {
        let polys = turn && i && b.shape ? placed(b.shape, i) : b.polys;
        if (doc.optimize) polys = nearest(polys, cursor);
        const last = polys[polys.length - 1]; if (last) cursor = last[last.length - 1];
        out.push({ recipe: r, polys, name: b.name, index: i, z: -depthStep(r) * i });
      }
    }
    return out;
  }
  const passLen = p => p.polys.reduce((s, q) => s + G.length(q), 0);
  function passTravel(p, start) { let s = 0, c = start; for (const q of p.polys) { s += Math.hypot(q[0][0] - c[0], q[0][1] - c[1]); c = q[q.length - 1]; } return [s, c]; }
  function jobStats(passes) {
    let L = 0, T = 0, D = 0, c = [0, 0];
    for (const p of passes) { const l = passLen(p), [tv, e] = passTravel(p, c); c = e; L += l; T += tv; D += (p.recipe.speed > 0 ? l / p.recipe.speed * 60 : 0) + tv / RAPID * 60; }
    return { L, T, D };
  }

  /* ----- export ISO Cielle + CLJOB ----- */
  const TRANSLIT = { 'à': 'a', 'â': 'a', 'ä': 'a', 'á': 'a', 'ç': 'c', 'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e', 'î': 'i', 'ï': 'i', 'í': 'i', 'ô': 'o', 'ö': 'o', 'ó': 'o',
    'ù': 'u', 'û': 'u', 'ü': 'u', 'ú': 'u', 'ÿ': 'y', 'ñ': 'n', 'œ': 'oe', 'æ': 'ae', 'ß': 'ss', '—': '-', '–': '-', '’': "'", '‘': "'", '“': '"', '”': '"', '…': '...', '×': 'x',
    '°': 'deg', 'µ': 'u', '«': '"', '»': '"', 'Ø': 'D', 'ø': 'd', '·': '-' };
  const ascii = t => String(t || '').replace(/[^\x00-\x7f]/g, ch => { const l = ch.toLowerCase(); const r = TRANSLIT[l]; return r === undefined ? '?' : (ch !== l ? r.toUpperCase() : r); });
  const sanitize = (n, fb = 'gravure') => (ascii(n).replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^[_-]+|[_-]+$/g, '').replace(/__+/g, '_').slice(0, 60) || fb);
  function comment(text, limit = 120) {
    let s = ascii(text).replace(/%/g, ' pc').replace(/[/\\|]/g, '-').replace(/&/g, ' et ').replace(/[^A-Za-z0-9 ,\-.:=_]/g, '-').split(/\s+/).join(' ').trim();
    while (s.includes('--')) s = s.replace('--', '-');
    if (s.length <= limit) return s;
    const c = s.slice(0, limit), sp = c.lastIndexOf(' ');
    return (sp >= limit / 2 ? c.slice(0, sp) : c).replace(/[ \-,;]+$/, '');
  }
  const f6 = v => (+v).toFixed(6), xmlEsc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  function renderISO(p) {
    const r = p.recipe, L = [], all = p.polys.flat();
    if (all.length) { const b = G.bounds(p.polys); L.push(`(INGOMBROFOGLIO:${b[0].toFixed(3)}, ${b[1].toFixed(3)}, ${b[2].toFixed(3)}, ${b[3].toFixed(3)})`); }
    L.push('(Programma generatore: TauDrive web)');
    if (p.name) L.push(`(${comment(p.name)})`);
    const tool = `T${r.tool | 0} (${comment(r.name, 40)},STELO: 6.000, BASE: 0.030, ROT: 0)`;
    L.push(tool, 'S10000', `G108 P${(+r.power).toFixed(3)} I${(+r.freq * 1000).toFixed(2)}`, tool);
    const zDown = Math.min(0, p.z); let first = true;
    for (const q of p.polys) {
      if (q.length < 2) continue;
      L.push(`G00X${f6(q[0][0])}Y${f6(q[0][1])}`, `G00Z${f6(zDown)}`);
      if (first) { L.push(`F${+r.speed}`); first = false; }
      for (let i = 1; i < q.length; i++) L.push(`G01X${f6(q[i][0])}Y${f6(q[i][1])}`);
      L.push(`G00Z${f6(-0.001)}`);
    }
    return L.join('\n') + '\n';
  }
  function renderCLJOB(paths, passes) {
    const hw = doc.plateW / 2, hh = doc.plateH / 2;
    const o = ['<?xml version="1.0" encoding="UTF-8"?>', '<LISTA_LAVORI>', '<TAG_JOB>2</TAG_JOB>', '<VERSIONEJOB>16</VERSIONEJOB>', '<ROTAZIONE>0.000000</ROTAZIONE>',
      '<NUMERO_LENTE_LASER>-1</NUMERO_LENTE_LASER>', `<INGOMBRO_TARGA_X1>${f6(-hw)}</INGOMBRO_TARGA_X1>`, `<INGOMBRO_TARGA_X2>${f6(hw)}</INGOMBRO_TARGA_X2>`,
      `<INGOMBRO_TARGA_Y1>${f6(-hh)}</INGOMBRO_TARGA_Y1>`, `<INGOMBRO_TARGA_Y2>${f6(hh)}</INGOMBRO_TARGA_Y2>`, '<RIFERIMENTOLAVOROX>0.000000</RIFERIMENTOLAVOROX>',
      '<RIFERIMENTOLAVOROY>0.000000</RIFERIMENTOLAVOROY>', '<RIFERIMENTOLAVOROZ>0.000000</RIFERIMENTOLAVOROZ>', '<USOMORSA>-1</USOMORSA>',
      '<QUOTARIFERIMENTOSUPERFICIE>0.000000</QUOTARIFERIMENTOSUPERFICIE>', '<INCLINAZIONE_MORSA>0.000000</INCLINAZIONE_MORSA>', '<NOME_ORIGINE></NOME_ORIGINE>',
      '<QUOTARIFERIMENTOSUPERFICIE_DRITTA>0.000000</QUOTARIFERIMENTOSUPERFICIE_DRITTA>', '<SPESSOREMATERIALE>0.000000</SPESSOREMATERIALE>',
      '<DESTINAZIONE_INCISIONE>-1</DESTINAZIONE_INCISIONE>', '<NUMERO_ZONE_TARGA_GRANDE>-1</NUMERO_ZONE_TARGA_GRANDE>',
      '<LUNGHEZZA_ZONA_TARGA_GRANDE>0.000000</LUNGHEZZA_ZONA_TARGA_GRANDE>', '<OFFSET_ZONA_TARGA_GRANDE>0.000000</OFFSET_ZONA_TARGA_GRANDE>',
      '<NUMEROCROCINI>0</NUMEROCROCINI>', '<TIPOPEZZO>-1</TIPOPEZZO>', `<NOMEJOB>${xmlEsc(comment(doc.name, 60))}</NOMEJOB>`, `<NUMERO_LAVORI>${paths.length}</NUMERO_LAVORI>`];
    paths.forEach((path, i) => { const p = passes[i], T = p.recipe.tool | 0;
      o.push('<DESCRIZIONE_LAVORI>', `<NOME>${xmlEsc(ascii(path))}</NOME>`, `<UTENSILE>${T}</UTENSILE>`, `<LISTA_UTENSILI>${T}</LISTA_UTENSILI>`, '<MODECENTRO>0</MODECENTRO>',
        `<CENTROLAVOROX>${f6(doc.wcx)}</CENTROLAVOROX>`, `<CENTROLAVOROY>${f6(doc.wcy)}</CENTROLAVOROY>`, '<CENTROLAVOROZ>0.000000</CENTROLAVOROZ>',
        '<INCLINAZIONENX>0.000000</INCLINAZIONENX>', '<ROTAZIONENX>0.000000</ROTAZIONENX>', '<ROTAZIONEXY>0.000000</ROTAZIONEXY>', '<TGRANDELASER>1</TGRANDELASER>',
        '<FLAGLAVORO>0</FLAGLAVORO>', '<PROFSUMORSADRITTA>0.000000</PROFSUMORSADRITTA>', '<NOME_ENTITA_PREZIOSA></NOME_ENTITA_PREZIOSA>',
        '<ROTAZIONE_ENTITA_PREZIOSA>0.000000</ROTAZIONE_ENTITA_PREZIOSA>', `<DESCRIZIONE_ENTITA>${xmlEsc(comment(p.name, 60))}</DESCRIZIONE_ENTITA>`, '</DESCRIZIONE_LAVORI>'); });
    o.push('</LISTA_LAVORI>'); return o.join('\n') + '\n';
  }
  function makeJob() {
    const passes = buildPasses(); if (!passes.length) return null;
    const stem = sanitize(doc.name), baseDir = String(doc.machineDir || '').replace(/[\\/]+$/, ''), files = [];
    const paths = passes.map((p, i) => { const name = `${stem}_Z${String(i + 1).padStart(4, '0')}.ISO`; files.push({ name, text: renderISO(p), pass: i }); return baseDir ? `${baseDir}\\${name}` : name; });
    files.push({ name: `${stem}.CLJOB`, text: renderCLJOB(paths, passes) });
    return { stem, passes, files };
  }

  /* ======================= historique et sauvegarde ======================= */
  const snap = () => JSON.stringify({ doc, sel });
  function commit() { undo.push(lastSnap); if (undo.length > 100) undo.shift(); redo = []; lastSnap = snap(); save(); refresh(); }
  let lastSnap = snap(), saveT = 0;
  function restore(s) { const o = JSON.parse(s); doc = o.doc; sel = o.sel; lastSnap = s; clearCache(); save(); refresh(); }
  function doUndo() { if (!undo.length) return; redo.push(lastSnap); restore(undo.pop()); }
  function doRedo() { if (!redo.length) return; undo.push(lastSnap); restore(redo.pop()); }
  function save() { clearTimeout(saveT); saveT = setTimeout(() => { if (ST()) ST().set('taudrive', { doc, procs }); }, 400); }
  function load() {
    const d = ST() ? ST().get('taudrive', null) : null;
    if (d && d.doc) { doc = Object.assign(defDoc(), d.doc); procs = d.procs || []; }
    else { const s = MAKE.text(); s.text = 'TauDrive'; s.size = 8; s.frame = 'rect'; s.p.hatch = 0.1; doc.shapes.push(s); sel = s.id; }
    lastSnap = snap();
  }

  /* ======================= interface : plan de travail ======================= */
  const cv = $('td-cv'), ctx = cv.getContext('2d');
  let view = { k: 4, cx: 0, cy: 0 }, drag = null, W = 0, H = 0, fitted = false;
  const sx = x => W / 2 + (x - view.cx) * view.k, sy = y => H / 2 - (y - view.cy) * view.k;
  const wx = px => (px - W / 2) / view.k + view.cx, wy = py => -(py - H / 2) / view.k + view.cy;
  function fitView() {
    const r = cv.getBoundingClientRect(), b = [-doc.fieldW / 2, -doc.fieldH / 2, doc.fieldW / 2, doc.fieldH / 2];
    if (r.width < 60 || r.height < 60) { fitted = false; return; }
    fitted = true;
    doc.shapes.forEach(s => { const e = extent(s); if (e) { b[0] = Math.min(b[0], e[0]); b[1] = Math.min(b[1], e[1]); b[2] = Math.max(b[2], e[2]); b[3] = Math.max(b[3], e[3]); } });
    view = { k: Math.min((r.width - 30) / (b[2] - b[0]), (r.height - 30) / (b[3] - b[1])), cx: (b[0] + b[2]) / 2, cy: (b[1] + b[3]) / 2 };
    redraw();
  }
  const selShape = () => doc.shapes.find(s => s.id === sel) || null;
  function handles(s) {
    const e = extent(s); if (!e) return null;
    const [x1, y1, x2, y2] = e.map((v, i) => (i % 2 ? sy(v) : sx(v)));
    return { box: [x1, y2, x2, y1], scale: [x2, y1], rot: [(x1 + x2) / 2, y2 - 22] };
  }
  let raf = 0;
  function redraw() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; paint(); }); }
  function paint() {
    const r = cv.getBoundingClientRect(), d = devicePixelRatio || 1; W = r.width; H = r.height;
    if (cv.width !== Math.round(W * d) || cv.height !== Math.round(H * d)) { cv.width = Math.round(W * d); cv.height = Math.round(H * d); }
    ctx.setTransform(d, 0, 0, d, 0, 0); ctx.clearRect(0, 0, W, H);
    const ink = css('--ink'), mute = css('--mute'), line = css('--line'), brass = css('--brass'), warn = css('--warn') || '#d33';
    // grille 10 mm, plaque, champ
    ctx.lineWidth = 1; ctx.strokeStyle = line; ctx.globalAlpha = 0.5; ctx.beginPath();
    const g = view.k < 1.5 ? 50 : 10;
    for (let x = Math.ceil(wx(0) / g) * g; x < wx(W); x += g) { ctx.moveTo(sx(x), 0); ctx.lineTo(sx(x), H); }
    for (let y = Math.ceil(wy(H) / g) * g; y < wy(0); y += g) { ctx.moveTo(0, sy(y)); ctx.lineTo(W, sy(y)); }
    ctx.stroke(); ctx.globalAlpha = 1;
    ctx.fillStyle = css('--card'); ctx.fillRect(sx(-doc.plateW / 2), sy(doc.plateH / 2), doc.plateW * view.k, doc.plateH * view.k);
    ctx.strokeStyle = mute; ctx.setLineDash([6, 4]); ctx.strokeRect(sx(-doc.fieldW / 2), sy(doc.fieldH / 2), doc.fieldW * view.k, doc.fieldH * view.k); ctx.setLineDash([]);
    ctx.strokeStyle = line; ctx.beginPath(); ctx.moveTo(sx(-3), sy(0)); ctx.lineTo(sx(3), sy(0)); ctx.moveTo(sx(0), sy(-3)); ctx.lineTo(sx(0), sy(3)); ctx.stroke();
    let loading = false;
    for (const s of doc.shapes) {
      if (!s.visible) continue;
      const l = local(s); if (!l) { loading = true; continue; }
      const out = (() => { const e = extent(s); return e && (e[0] < -doc.fieldW / 2 - 1e-6 || e[2] > doc.fieldW / 2 + 1e-6 || e[1] < -doc.fieldH / 2 - 1e-6 || e[3] > doc.fieldH / 2 + 1e-6); })();
      ctx.save(); ctx.translate(sx(+s.x), sy(+s.y)); ctx.scale(view.k, -view.k);
      ctx.lineWidth = 1 / view.k;
      ctx.strokeStyle = brass; ctx.globalAlpha = 0.8; ctx.beginPath();
      for (let i = l.nc; i < l.polys.length; i++) { const p = l.polys[i]; ctx.moveTo(p[0][0], p[0][1]); for (let j = 1; j < p.length; j++) ctx.lineTo(p[j][0], p[j][1]); }
      ctx.stroke(); ctx.globalAlpha = 1;
      ctx.strokeStyle = out ? warn : ink; ctx.lineWidth = 1.4 / view.k; ctx.beginPath();
      for (let i = 0; i < l.nc && i < l.polys.length; i++) { const p = l.polys[i]; ctx.moveTo(p[0][0], p[0][1]); for (let j = 1; j < p.length; j++) ctx.lineTo(p[j][0], p[j][1]); }
      ctx.stroke(); ctx.restore();
    }
    const s = selShape();
    if (s && s.visible) {
      const h = handles(s);
      if (h) {
        const [x1, y1, x2, y2] = h.box; ctx.strokeStyle = brass; ctx.setLineDash([4, 3]); ctx.lineWidth = 1; ctx.strokeRect(x1 - 4, y1 - 4, x2 - x1 + 8, y2 - y1 + 8); ctx.setLineDash([]);
        ctx.fillStyle = brass; ctx.strokeStyle = ink; ctx.fillRect(h.scale[0] - 1, h.scale[1] - 1, 10, 10); ctx.strokeRect(h.scale[0] - 1, h.scale[1] - 1, 10, 10); ctx.strokeStyle = brass;
        ctx.beginPath(); ctx.moveTo((x1 + x2) / 2, y1 - 4); ctx.lineTo(h.rot[0], h.rot[1]); ctx.stroke();
        ctx.beginPath(); ctx.arc(h.rot[0], h.rot[1], 6, 0, 7); ctx.fill(); ctx.strokeStyle = ink; ctx.stroke();
      }
    }
    if (loading) { ctx.fillStyle = mute; ctx.font = '14px Barlow,sans-serif'; ctx.fillText(tr('Chargement de la police…'), 12, 22); }
    status();
  }
  function hit(px, py) {
    const x = wx(px), y = wy(py), tol = 6 / view.k;
    for (let i = doc.shapes.length - 1; i >= 0; i--) {
      const s = doc.shapes[i]; if (!s.visible) continue;
      const e = extent(s); if (!e || x < e[0] - tol || x > e[2] + tol || y < e[1] - tol || y > e[3] + tol) continue;
      const l = local(s); if (!l) continue;
      const lx = x - s.x, ly = y - s.y, cont = l.contours;
      if (cont.some(p => G.closed(p) && G.inside([lx, ly], p))) return s;
      for (const p of cont) for (let j = 1; j < p.length; j++) if (segDist(lx, ly, p[j - 1], p[j]) < tol) return s;
      if (e[2] - e[0] < 3 * tol || e[3] - e[1] < 3 * tol) return s;
    }
    return null;
  }
  const near = (a, b, r = 12) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= r;
  cv.addEventListener('pointerdown', ev => {
    cv.setPointerCapture(ev.pointerId); cv.focus();
    const r = cv.getBoundingClientRect(), px = ev.clientX - r.left, py = ev.clientY - r.top, s = selShape(), h = s && handles(s);
    if (ev.button === 1 || ev.button === 2 || ev.altKey) { drag = { mode: 'pan', px, py, v: { ...view } }; return; }
    if (h && near([px, py], [h.rot[0], h.rot[1]])) { const e = extent(s); drag = { mode: 'rot', s, c: [(e[0] + e[2]) / 2, (e[1] + e[3]) / 2], a0: Math.atan2(wy(py) - (e[1] + e[3]) / 2, wx(px) - (e[0] + e[2]) / 2), orig: JSON.parse(JSON.stringify(s)) }; return; }
    if (h && near([px, py], [h.scale[0] + 4, h.scale[1] + 4])) { const e = extent(s); drag = { mode: 'scale', s, anchor: [e[0], e[3]], d0: Math.hypot(wx(px) - e[0], wy(py) - e[3]), orig: JSON.parse(JSON.stringify(s)) }; return; }
    const t = hit(px, py);
    if (t) { sel = t.id; drag = { mode: 'move', s: t, x0: wx(px), y0: wy(py), ox: +t.x, oy: +t.y, moved: false }; refreshPanel(); redraw(); }
    else { if (sel) { sel = null; refreshPanel(); } drag = { mode: 'pan', px, py, v: { ...view } }; redraw(); }
  });
  cv.addEventListener('pointermove', ev => {
    const r = cv.getBoundingClientRect(), px = ev.clientX - r.left, py = ev.clientY - r.top;
    $('td-pos').textContent = `X ${nf(wx(px), 2)}  Y ${nf(wy(py), 2)}`;
    if (!drag) return;
    const snapv = v => (ev.shiftKey ? v : Math.round(v * 10) / 10);
    if (drag.mode === 'pan') { view.cx = drag.v.cx - (px - drag.px) / view.k; view.cy = drag.v.cy + (py - drag.py) / view.k; }
    else if (drag.mode === 'move') { drag.s.x = snapv(drag.ox + wx(px) - drag.x0); drag.s.y = snapv(drag.oy + wy(py) - drag.y0); drag.moved = true; refreshInspectorValues(); }
    else if (drag.mode === 'rot') {
      const a = Math.atan2(wy(py) - drag.c[1], wx(px) - drag.c[0]); let deg = (drag.orig.rot || 0) + (a - drag.a0) * 180 / Math.PI;
      if (!ev.shiftKey) deg = Math.round(deg / 5) * 5; deg = ((deg % 360) + 540) % 360 - 180;
      rotateAbout(drag.s, drag.orig, deg, drag.c); drag.moved = true; refreshInspectorValues();
    } else if (drag.mode === 'scale') {
      const f = Math.max(0.02, Math.hypot(wx(px) - drag.anchor[0], wy(py) - drag.anchor[1]) / (drag.d0 || 1));
      scaleShape(drag.s, drag.orig, f, drag.anchor); drag.moved = true; refreshInspectorValues();
    }
    redraw();
  });
  const endDrag = () => { if (drag && drag.moved) commit(); drag = null; };
  cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('wheel', ev => {
    ev.preventDefault(); const r = cv.getBoundingClientRect(), px = ev.clientX - r.left, py = ev.clientY - r.top, x = wx(px), y = wy(py);
    view.k = Math.max(0.3, Math.min(200, view.k * Math.exp(-ev.deltaY * 0.0015))); view.cx = x - (px - W / 2) / view.k; view.cy = y + (py - H / 2) / view.k; redraw();
  }, { passive: false });
  function rotateAbout(s, o, deg, c) {
    const d = (deg - (o.rot || 0)) * Math.PI / 180, cs = Math.cos(d), sn = Math.sin(d), dx = o.x - c[0], dy = o.y - c[1];
    s.rot = +deg.toFixed(3); s.x = +(c[0] + dx * cs - dy * sn).toFixed(4); s.y = +(c[1] + dx * sn + dy * cs).toFixed(4);
  }
  function scaleShape(s, o, f, anchor) {
    if (s.type === 'rect' || s.type === 'ellipse') { s.w = +(o.w * f).toFixed(3); s.h = +(o.h * f).toFixed(3); }
    else if (s.type === 'text') s.size = +(o.size * f).toFixed(3);
    else if (s.type === 'code') s.module = +(o.module * f).toFixed(4);
    else if (s.type === 'path') { s.polys = o.polys.map(p => G.scaleXY(p, f, f)); s.rev = (s.rev || 0) + 1; }
    s.x = +(anchor[0] + (o.x - anchor[0]) * f).toFixed(4); s.y = +(anchor[1] + (o.y - anchor[1]) * f).toFixed(4);
    clearCache();
  }
  cv.addEventListener('keydown', ev => {
    const s = selShape(), k = ev.key, step = ev.shiftKey ? 1 : 0.1;
    if ((ev.ctrlKey || ev.metaKey) && k.toLowerCase() === 'z') { ev.preventDefault(); ev.shiftKey ? doRedo() : doUndo(); return; }
    if ((ev.ctrlKey || ev.metaKey) && k.toLowerCase() === 'y') { ev.preventDefault(); doRedo(); return; }
    if ((ev.ctrlKey || ev.metaKey) && k.toLowerCase() === 'd') { ev.preventDefault(); act.dup(); return; }
    if (!s) return;
    if (k === 'Delete' || k === 'Backspace') { ev.preventDefault(); act.del(); return; }
    const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[k];
    if (mv) { ev.preventDefault(); s.x = +(+s.x + mv[0]).toFixed(4); s.y = +(+s.y + mv[1]).toFixed(4); commit(); }
  });

  /* ======================= barre d'outils ======================= */
  function add(s) { doc.shapes.push(s); sel = s.id; commit(); }
  const act = {
    rect: () => add(MAKE.rect()), ellipse: () => add(MAKE.ellipse()), text: () => add(MAKE.text()), line: () => add(MAKE.line()),
    code: () => { const c = MAKE.code(); c.frame = 'rect'; c.frameMargin = 1; add(c); },
    coupon: () => openCoupon(),
    dxf: () => $('td-dxf-file').click(),
    dup() { const s = selShape(); if (!s) return; const c = JSON.parse(JSON.stringify(s)); c.id = newId(); c.x = +s.x + 5; c.y = +s.y - 5; c.name = s.name ? s.name + ' ' + tr('copie') : ''; add(c); },
    del() { if (!sel) return; doc.shapes = doc.shapes.filter(s => s.id !== sel); sel = null; commit(); },
    up() { const i = doc.shapes.findIndex(s => s.id === sel); if (i >= 0 && i < doc.shapes.length - 1) { [doc.shapes[i], doc.shapes[i + 1]] = [doc.shapes[i + 1], doc.shapes[i]]; commit(); } },
    down() { const i = doc.shapes.findIndex(s => s.id === sel); if (i > 0) { [doc.shapes[i], doc.shapes[i - 1]] = [doc.shapes[i - 1], doc.shapes[i]]; commit(); } },
    undo: doUndo, redo: doRedo, fit: fitView,
    center() { const s = selShape(); if (!s) return; const e = extent(s); s.x = +(+s.x - (e[0] + e[2]) / 2).toFixed(4); s.y = +(+s.y - (e[1] + e[3]) / 2).toFixed(4); commit(); },
    nouveau() { if (doc.shapes.length && !confirm(tr('Effacer le dessin en cours ?'))) return; doc = Object.assign(defDoc(), { name: doc.name, plateW: doc.plateW, plateH: doc.plateH, wcx: doc.wcx, wcy: doc.wcy, machineDir: doc.machineDir }); sel = null; commit(); },
    open: () => $('td-open-file').click(),
    saveFile() { download(sanitize(doc.name) + '.taudrive.json', JSON.stringify({ format: 'taudrive-web', version: 1, doc, procs }, null, 1), 'application/json'); }
  };
  document.querySelectorAll('[data-td]').forEach(b => b.addEventListener('click', () => act[b.dataset.td]()));
  function download(name, text, type = 'text/plain') {
    const a = document.createElement('a'); a.href = URL.createObjectURL(text instanceof Blob ? text : new Blob([text], { type })); a.download = name;
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  $('td-open-file').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return; e.target.value = '';
    f.text().then(tx => { try { const o = JSON.parse(tx); if (!o.doc || !Array.isArray(o.doc.shapes)) throw new Error(tr('fichier TauDrive web attendu'));
      doc = Object.assign(defDoc(), o.doc); if (Array.isArray(o.procs)) procs = o.procs; sel = null; clearCache(); commit(); fitView(); }
      catch (x) { alert(tr('Fichier invalide : {e}', { e: x.message })); } });
  });

  /* ----- import de dessins (DXF, SVG, PDF, AI, EPS) : vecteurs.js ----- */
  let dxfPending = null;
  function importDialog(r) {
    if (!r.items.length) { alert(tr('Aucun tracé exploitable dans « {f} ».', { f: r.name })); return; }
    dxfPending = r;
    const layers = [...new Set(r.items.map(i => i.layer))];
    $('td-dxf-title').textContent = tr('Importer un dessin') + ` – ${r.name} (${r.format})`;
    $('td-dxf-layers').innerHTML = layers.map(l => `<label><input type="checkbox" value="${esc(l)}" checked> ${esc(l)} <small>(${r.items.filter(i => i.layer === l).length})</small></label>`).join('');
    $('td-dxf-units').value = String(r.unitScale || 1);
    $('td-dxf-info').textContent = r.ignored && r.ignored.length ? tr('Entités ignorées : {l}', { l: r.ignored.join(', ') }) : '';
    $('td-dxf-dlg').showModal();
  }
  $('td-dxf-file').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return; e.target.value = '';
    Vecteurs.read(f).then(importDialog).catch(x => alert(tr('Lecture impossible : {e}', { e: x.message })));
  });
  // dessin envoyé par TauConvert en ligne
  try { const env = sessionStorage.getItem('taudrive-import'); if (env) { sessionStorage.removeItem('taudrive-import'); setTimeout(() => importDialog(JSON.parse(env)), 300); } } catch (x) { /* */ }
  $('td-dxf-ok').addEventListener('click', ev => {
    ev.preventDefault(); const r = dxfPending; if (!r) return;
    const on = new Set([...$('td-dxf-layers').querySelectorAll('input:checked')].map(i => i.value)), k = (+$('td-dxf-units').value || 1) * (+$('td-dxf-scale').value || 1);
    let polys = joinPolys(r.items.filter(i => on.has(i.layer)).map(i => i.poly)).map(p => G.scaleXY(p, k, k));
    if (!polys.length) { $('td-dxf-dlg').close(); return; }
    const b = G.bounds(polys), cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    polys = polys.map(p => G.translate(p, -cx, -cy));
    const center = $('td-dxf-center').checked, split = $('td-dxf-split').checked;
    const mk = (pp, nm, dx, dy) => Object.assign(base('path'), { polys: pp, source: nm, x: center ? dx : cx + dx, y: center ? dy : cy + dy });
    if (split) polys.forEach((p, i) => { const bb = G.bounds([p]), mx = (bb[0] + bb[2]) / 2, my = (bb[1] + bb[3]) / 2; doc.shapes.push(mk([G.translate(p, -mx, -my)], `${r.name} ${i + 1}`, mx, my)); });
    else doc.shapes.push(mk(polys, r.name, 0, 0));
    sel = doc.shapes[doc.shapes.length - 1].id; $('td-dxf-dlg').close(); commit(); fitView();
  });
  $('td-dxf-cancel').addEventListener('click', () => $('td-dxf-dlg').close());

  /* ======================= coupon d'essai ======================= */
  // Une grille : un paramètre varie en X, un autre en Y, chaque case porte ses valeurs gravées à côté d'elle.
  const AXES = [['power', 'Puissance', '%', 1], ['speed', 'Vitesse', 'm/min', 0.001], ['freq', 'Fréquence', 'kHz', 1], ['pulse', 'Impulsion', 'ns', 1],
    ['hatch', 'Hachure', 'mm', 1], ['passes', 'Nb passes', '', 1], ['depthTotal', 'Profondeur', 'mm', 1]];
  const ENTIERS = new Set(['passes', 'pulse']), ARRONDI = { power: 0.5, speed: 500, freq: 1, hatch: 0.005, depthTotal: 0.01 };
  const axe = k => AXES.find(a => a[0] === k) || ['', '', '', 1];
  const fmtAxe = (k, v) => (ENTIERS.has(k) ? String(Math.round(v)) : String(+(v * axe(k)[3]).toFixed(6)));
  function pasAxe(k, a, b, n) {
    n = Math.max(1, n | 0); let v = n === 1 ? [a] : Array.from({ length: n }, (_, i) => a + (b - a) * i / (n - 1));
    if (ENTIERS.has(k)) return [...new Set(v.map(x => Math.max(1, Math.round(x))))].sort((p, q) => p - q);
    const pas = ARRONDI[k]; if (pas) v = [...new Set(v.map(x => +(Math.round(x / pas) * pas).toFixed(6)))].sort((p, q) => p - q);
    return v;
  }
  const CP = { xk: 'power', xa: 20, xb: 100, xn: 5, yk: 'speed', ya: 20, yb: 100, yn: 4, cell: 8, gap: 3, label: 1.8, filled: true, labelsHatched: false, title: true, motif: 'rect', replace: false };
  function openCoupon() {
    const dlg = $('td-coupon-dlg'), s = selShape(), opt = (k, none) => (none ? `<option value="">${esc(tr('(aucun)'))}</option>` : '')
      + AXES.map(([a, l, u]) => `<option value="${a}"${a === k ? ' selected' : ''}>${esc(tr(l))}${u ? ` (${u})` : ''}</option>`).join('');
    $('td-coupon-form').innerHTML = `
      <fieldset><legend>${tr('Axe X')}</legend><div class="fields">
        <label>${tr('Paramètre')}<select data-c="xk">${opt(CP.xk)}</select></label><label>${tr('De')}<input type="number" step="any" data-c="xa" value="${CP.xa}"></label>
        <label>${tr('À')}<input type="number" step="any" data-c="xb" value="${CP.xb}"></label><label>${tr('Nombre')}<input type="number" min="1" max="20" data-c="xn" value="${CP.xn}"></label></div></fieldset>
      <fieldset><legend>${tr('Axe Y')}</legend><div class="fields">
        <label>${tr('Paramètre')}<select data-c="yk">${opt(CP.yk, true)}</select></label><label>${tr('De')}<input type="number" step="any" data-c="ya" value="${CP.ya}"></label>
        <label>${tr('À')}<input type="number" step="any" data-c="yb" value="${CP.yb}"></label><label>${tr('Nombre')}<input type="number" min="1" max="20" data-c="yn" value="${CP.yn}"></label></div></fieldset>
      <div class="fields">
        <label>${tr('Case (mm)')}<input type="number" step="any" data-c="cell" value="${CP.cell}"></label><label>${tr('Écart (mm)')}<input type="number" step="any" data-c="gap" value="${CP.gap}"></label>
        <label>${tr('Hauteur des étiquettes (mm)')}<input type="number" step="any" data-c="label" value="${CP.label}"></label>
        <label>${tr('Motif des cases')}<select data-c="motif"><option value="rect">${tr('carré plein')}</option><option value="sel"${s ? '' : ' disabled'}${CP.motif === 'sel' && s ? ' selected' : ''}>${tr('forme sélectionnée')}</option></select></label>
        <label class="chk wide"><input type="checkbox" data-c="filled"${CP.filled ? ' checked' : ''}> ${tr('Remplir les cases (hachurage)')}</label>
        <label class="chk wide"><input type="checkbox" data-c="labelsHatched"${CP.labelsHatched ? ' checked' : ''}> ${tr('Étiquettes hachurées')}</label>
        <label class="chk wide"><input type="checkbox" data-c="title"${CP.title ? ' checked' : ''}> ${tr('Titre du coupon')}</label>
        <label class="chk wide"><input type="checkbox" data-c="replace"${CP.replace ? ' checked' : ''}> ${tr('Remplacer le dessin en cours')}</label></div>
      <p class="small muted">${tr('Les paramètres qui ne varient pas sont ceux de la process de la forme sélectionnée (ou de la dernière process utilisée). Vitesse en m/min.')}</p>`;
    dlg.showModal();
  }
  function buildCoupon() {
    document.querySelectorAll('#td-coupon-form [data-c]').forEach(el => { CP[el.dataset.c] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? +el.value : el.value; });
    const s = selShape(), baseR = JSON.parse(JSON.stringify(s ? s.p : (lastRecipe || defRecipe())));
    const vals = (k, a, b, n) => (k ? pasAxe(k, a / axe(k)[3], b / axe(k)[3], n) : [null]);
    const xs = vals(CP.xk, CP.xa, CP.xb, CP.xn), ys = vals(CP.yk, CP.ya, CP.yb, CP.yn), cell = Math.max(1, CP.cell), pas = cell + Math.max(0, CP.gap);
    const larg = xs.length * pas - CP.gap, haut = ys.length * pas - CP.gap;
    const long = Math.max(2, ...ys.filter(v => v !== null).map(v => fmtAxe(CP.yk, v).length));
    const marge = Math.max(CP.label * 0.62 * long + 2, 8), x0 = -(larg + marge) / 2 + marge, y0 = (haut + marge) / 2 - marge;
    const marker = () => Object.assign({}, baseR, { name: baseR.name + ' – ' + tr('étiquettes'), power: Math.min(baseR.power, 25), hatch: CP.labelsHatched ? 0.05 : 0, passes: 1, depthMode: 'step', depthStep: 0, depthTotal: 0 });
    let motif = null;
    if (CP.motif === 'sel' && s) { const l = local(s); if (l && l.contours.length) { const b = G.bounds(l.contours), k = cell * 0.9 / Math.max(b[2] - b[0], b[3] - b[1]);
      motif = l.contours.map(p => G.scaleXY(G.translate(p, -(b[0] + b[2]) / 2, -(b[1] + b[3]) / 2), k, k)); } }
    const out = [];
    ys.forEach((yv, iy) => {
      const cy = y0 - iy * pas - cell / 2;
      xs.forEach((xv, ix) => {
        const cx = x0 + ix * pas + cell / 2, r = JSON.parse(JSON.stringify(baseR)), det = [];
        [[CP.xk, xv], [CP.yk, yv]].forEach(([k, v]) => { if (!k || v === null) return; r[k] = v; if (k === 'depthTotal') r.depthMode = 'total'; det.push(`${fmtAxe(k, v)}${axe(k)[2]}`); });
        if (CP.filled) { if (!(r.hatch > 0)) r.hatch = 0.05; } else if (CP.xk !== 'hatch' && CP.yk !== 'hatch') r.hatch = 0;
        r.name = `${baseR.name} – ${det.join(' / ')}`;
        const sh = motif ? Object.assign(base('path'), { polys: motif.map(p => p.map(q => q.slice())), source: tr('motif') }) : Object.assign(base('rect'), { w: cell, h: cell });
        out.push(Object.assign(sh, { x: +cx.toFixed(4), y: +cy.toFixed(4), p: r, name: `${tr('case')} ${det.join(' / ')}` }));
      });
      if (CP.yk && yv !== null) out.push(Object.assign(base('text'), { text: fmtAxe(CP.yk, yv), size: CP.label, font: 'roboto', align: 'center', valign: 'middle', spacing: 1.4, stretch: 1,
        x: +(x0 - marge / 2).toFixed(4), y: +cy.toFixed(4), p: marker(), name: `${tr('étiquette')} ${tr(axe(CP.yk)[1])}` }));
    });
    xs.forEach((xv, ix) => { if (!CP.xk || xv === null) return;
      out.push(Object.assign(base('text'), { text: fmtAxe(CP.xk, xv), size: CP.label, font: 'roboto', align: 'center', valign: 'middle', spacing: 1.4, stretch: 1,
        x: +(x0 + ix * pas + cell / 2).toFixed(4), y: +(y0 + marge / 2).toFixed(4), p: marker(), name: `${tr('étiquette')} ${tr(axe(CP.xk)[1])}` })); });
    if (CP.title) {
      let titre = `${baseR.name} · X ${tr(axe(CP.xk)[1])} ${axe(CP.xk)[2]}`; if (CP.yk) titre += ` · Y ${tr(axe(CP.yk)[1])} ${axe(CP.yk)[2]}`;
      out.push(Object.assign(base('text'), { text: titre, size: CP.label, font: 'roboto', align: 'center', valign: 'middle', spacing: 1.4, stretch: 1, x: 0, y: +(y0 + marge + CP.label).toFixed(4), p: marker(), name: tr('titre du coupon') }));
    }
    if (CP.replace) doc.shapes = [];
    doc.shapes.push(...out); if (CP.replace) doc.name = 'coupon'; sel = null;
    $('td-coupon-dlg').close(); clearCache(); commit(); fitView();
  }
  $('td-coupon-ok').addEventListener('click', ev => { ev.preventDefault(); buildCoupon(); });
  $('td-coupon-cancel').addEventListener('click', () => $('td-coupon-dlg').close());

  /* ======================= panneau : liste + propriétés ======================= */
  function refresh() { refreshPanel(); renderJobForm(); redraw(); }
  function refreshList() {
    $('td-list').innerHTML = doc.shapes.slice().reverse().map(s => `<li class="${s.id === sel ? 'on' : ''}" data-id="${s.id}">
      <button type="button" class="eye" data-eye="${s.id}" aria-label="${tr(s.visible ? 'Masquer' : 'Afficher')}" title="${tr(s.visible ? 'Masquer' : 'Afficher')}">${s.visible ? '●' : '○'}</button>
      <span>${esc(shapeName(s))}</span><small>${tr(TYPE_NOM[s.type])}</small></li>`).join('') || `<li class="vide">${tr('Aucune forme : ajoute un rectangle, une ellipse, un texte ou un DXF.')}</li>`;
    $('td-list').querySelectorAll('li[data-id]').forEach(li => li.addEventListener('click', ev => {
      if (ev.target.dataset.eye) { const s = doc.shapes.find(x => x.id === ev.target.dataset.eye); s.visible = !s.visible; commit(); return; }
      sel = li.dataset.id; refresh();
    }));
  }
  const F = (k, label, type = 'number', opts) => ({ k, label, type, opts });
  const RECIPE_FIELDS = [
    F('name', 'Nom de la process', 'text'), F('power', 'Puissance (%)'), F('freq', 'Fréquence (kHz)'), F('pulse', 'Impulsion (ns)'), F('speedM', 'Vitesse (m/min)'), F('tool', 'Outil (T)'),
    F('passes', 'Passes'), F('depthMode', 'Profondeur', 'select', [['step', 'pas par passe'], ['total', 'profondeur totale']]), F('depthStep', 'Pas Z par passe (mm)'), F('depthTotal', 'Profondeur totale (mm)'),
    F('hatch', 'Pas de hachurage (mm, 0 = contour seul)'), F('hatchAngle', 'Angle de hachurage (°)'), F('hatchStep', 'Rotation par passe (°)'), F('cross', 'Hachurage croisé', 'check'),
    F('inset', 'Retrait du hachurage (mm)'), F('wobble', 'Oscillation', 'select', [['none', 'aucune'], ['circle', 'cercle'], ['eight', 'huit'], ['transverse', 'transverse']]),
    F('wobAmp', 'Amplitude (mm)'), F('wobPitch', 'Pas d\'oscillation (mm)')
  ];
  function shapeFields(s) {
    const f = [F('name', 'Nom', 'text'), F('x', 'Centre X (mm)'), F('y', 'Centre Y (mm)'), F('rot', 'Rotation (°)')];
    if (s.type === 'rect' || s.type === 'ellipse') f.push(F('w', 'Largeur (mm)'), F('h', 'Hauteur (mm)'));
    if (s.type === 'text') f.push(F('text', 'Texte', 'textarea'), F('size', 'Hauteur des capitales (mm)'),
      F('font', 'Police', 'select', FONTS.map(x => [x.id, x.nom]).concat(userFont ? [['user', userFontName]] : [])),
      F('align', 'Alignement', 'select', [['left', 'gauche'], ['center', 'centré'], ['right', 'droite']]),
      F('valign', 'Ancrage vertical', 'select', [['top', 'haut'], ['middle', 'milieu'], ['baseline', 'ligne de base'], ['bottom', 'bas']]),
      F('spacing', 'Interligne (× hauteur)'), F('stretch', 'Étirement horizontal'));
    if (s.type === 'path') f.push(F('dimX', 'Dim X (mm)'), F('dimY', 'Dim Y (mm)'));
    if (s.type === 'code') f.push(F('data', 'Donnée encodée', 'text'), F('dm', 'Forme du symbole', 'select', [['square', 'carré'], ['rect', 'rectangulaire'], ['auto', 'au plus juste']]),
      F('module', 'Module (mm)'), F('fillStep', 'Pas de remplissage (mm, 0 = hachurage de la process)'));
    f.push(F('frame', 'Cadre (gravure en négatif)', 'select', [['none', 'aucun'], ['rect', 'rectangle'], ['circle', 'cercle']]), F('frameMargin', 'Marge du cadre (mm)'),
      F('frameW', 'Largeur imposée du cadre (mm, 0 = auto)'), F('frameH', 'Hauteur imposée du cadre (mm, 0 = auto)'),
      F('offset', 'Offset du dessin (mm, + grossit, − amincit)'), F('lineWidth', 'Épaisseur de trait (mm)'), F('lineStep', 'Pas des passages (mm, 0 = hachurage)'));
    return f;
  }
  function input(f, v, grp) {
    const id = `td-${grp}-${f.k}`, lab = esc(tr(f.label));
    if (f.type === 'check') return `<label class="chk"><input type="checkbox" id="${id}" data-g="${grp}" data-k="${f.k}"${v ? ' checked' : ''}> ${lab}</label>`;
    if (f.type === 'select') return `<label>${lab}<select id="${id}" data-g="${grp}" data-k="${f.k}">${f.opts.map(([a, b]) => `<option value="${esc(a)}"${String(v) === String(a) ? ' selected' : ''}>${esc(tr(b))}</option>`).join('')}</select></label>`;
    if (f.type === 'textarea') return `<label class="wide">${lab}<textarea id="${id}" data-g="${grp}" data-k="${f.k}" rows="2">${esc(v)}</textarea></label>`;
    return `<label${f.type === 'text' ? ' class="wide"' : ''}>${lab}<input id="${id}" data-g="${grp}" data-k="${f.k}" type="${f.type}"${f.type === 'number' ? ' step="any"' : ''} value="${esc(v ?? '')}"></label>`;
  }
  const valOf = (s, k) => {
    if (k === 'dimX' || k === 'dimY') { const e = extent(s); return e ? +(k === 'dimX' ? e[2] - e[0] : e[3] - e[1]).toFixed(3) : 0; }
    return s[k];
  };
  const rvalOf = (r, k) => (k === 'speedM' ? +(r.speed / 1000).toFixed(4) : r[k]);
  function refreshPanel() {
    refreshList();
    const s = selShape(), box = $('td-props');
    if (!s) { box.innerHTML = `<p class="muted">${tr('Sélectionne une forme sur le plan de travail ou dans la liste.')}</p>`; return; }
    const procOpts = procs.map((p, i) => `<option value="${i}">${esc(p.name)}</option>`).join('');
    box.innerHTML = `<h3>${esc(tr(TYPE_NOM[s.type]))}</h3><div class="fields">${shapeFields(s).map(f => input(f, valOf(s, f.k), 's')).join('')}</div>
      ${s.type === 'text' ? `<p class="muted small">${tr('Champs variables : {date}, {heure}, {annee}.')} <label class="linkish">${tr('Police personnelle (.ttf, .otf, .woff)…')}<input type="file" id="td-font-file" accept=".ttf,.otf,.woff" hidden></label></p>` : ''}
      <h3>${tr('Process laser')}</h3>
      <div class="procbar"><select id="td-proc-sel" aria-label="${tr('Process enregistrées')}"><option value="">${tr('Process enregistrées…')}</option>${procOpts}</select>
        <button type="button" id="td-proc-save">${tr('Enregistrer la process')}</button>${procs.length ? `<button type="button" id="td-proc-del">${tr('Supprimer la process')}</button>` : ''}
        <button type="button" id="td-proc-all">${tr('Appliquer à toutes les formes')}</button></div>
      <div class="fields">${RECIPE_FIELDS.map(f => input(f, rvalOf(s.p, f.k), 'r')).join('')}</div>
      <p class="muted small" id="td-proc-info"></p>`;
    box.querySelectorAll('[data-g]').forEach(el => el.addEventListener('change', () => setField(s, el)));
    box.querySelectorAll('input[type=number][data-g],input[type=text][data-g],textarea[data-g]').forEach(el => el.addEventListener('input', () => setField(s, el, true)));
    $('td-proc-sel').onchange = e => { const p = procs[+e.target.value]; if (p) { s.p = JSON.parse(JSON.stringify(p)); lastRecipe = s.p; clearCache(); commit(); } };
    $('td-proc-save').onclick = () => { const n = prompt(tr('Nom de la process :'), s.p.name); if (!n) return; s.p.name = n; const i = procs.findIndex(p => p.name === n);
      if (i >= 0) procs[i] = JSON.parse(JSON.stringify(s.p)); else procs.push(JSON.parse(JSON.stringify(s.p))); commit(); };
    if ($('td-proc-del')) $('td-proc-del').onclick = () => { const i = procs.findIndex(p => p.name === s.p.name); if (i < 0) return alert(tr('Choisis d\'abord une process enregistrée.')); if (confirm(tr('Supprimer « {n} » ?', { n: s.p.name }))) { procs.splice(i, 1); commit(); } };
    $('td-proc-all').onclick = () => { doc.shapes.forEach(x => { x.p = JSON.parse(JSON.stringify(s.p)); }); clearCache(); commit(); };
    if ($('td-font-file')) $('td-font-file').onchange = e => { const f = e.target.files[0]; if (!f) return;
      f.arrayBuffer().then(b => { try { userFont = [opentype.parse(b)]; userFontName = f.name; s.font = 'user'; clearCache(); commit(); } catch (x) { alert(tr('Police illisible : {e}', { e: x.message })); } }); };
    procInfo(s);
  }
  function procInfo(s) {
    const el = $('td-proc-info'); if (!el) return; const r = s.p, msgs = [];
    if (s.type === 'code') { const M = codeMatrix(s); msgs.push(M ? tr('DataMatrix {r} × {c} modules, {w} × {h} mm', { r: M.length, c: M[0].length, w: nf(M[0].length * s.module, 2), h: nf(M.length * s.module, 2) }) : codeErr[s.id]); }
    const d = depthStep(r); if (r.passes > 1) msgs.push(tr('{n} passes, pas Z {d} mm', { n: r.passes, d: nf(d, 4) }));
    if (r.wobble !== 'none' && r.wobPitch > 0) { const hz = r.speed / 60 / r.wobPitch; msgs.push(tr('oscillation : {hz} Hz au scanner', { hz: nf(hz, 0) }) + (hz > 500 ? ' – ' + tr('au-delà de 500 Hz, réduire la vitesse ou allonger le pas') : '')); }
    if (s.lineWidth > 0) msgs.push(tr('épaisseur {w} mm en {n} passages de chaque côté', { w: nf(s.lineWidth), n: Math.floor(s.lineWidth / (s.lineStep || r.hatch || 0.05) / 2) }));
    el.textContent = msgs.join(' · ');
  }
  function setField(s, el, live) {
    const k = el.dataset.k, g = el.dataset.g;
    let v = el.type === 'checkbox' ? el.checked : el.type === 'number' ? (el.value === '' ? null : +el.value) : el.value;
    if (v === null) return;
    if (g === 'r') { if (k === 'speedM') s.p.speed = v * 1000; else if (['passes', 'tool'].includes(k)) s.p[k] = Math.max(k === 'passes' ? 1 : 0, Math.round(v)); else s.p[k] = v; lastRecipe = s.p; }
    else if (k === 'dimX' || k === 'dimY') {
      const e = extent(s); if (!e || !(v > 0)) return; const cur = k === 'dimX' ? e[2] - e[0] : e[3] - e[1]; const f = v / cur;
      s.polys = s.polys.map(p => G.scaleXY(p, f, f)); s.rev = (s.rev || 0) + 1;
    } else s[k] = v;
    clearCache();
    if (live) { save(); redraw(); refreshInspectorValues(el); refreshList(); procInfo(s); if (!liveT) liveT = setTimeout(() => { liveT = 0; undo.push(lastSnap); redo = []; lastSnap = snap(); }, 600); }
    else commit();
  }
  let liveT = 0;
  function refreshInspectorValues(except) {
    const s = selShape(); if (!s) return;
    document.querySelectorAll('#td-props [data-g="s"]').forEach(el => { if (el === except || el === document.activeElement) return; const v = valOf(s, el.dataset.k); if (el.type !== 'checkbox' && v !== undefined) el.value = typeof v === 'number' ? +v.toFixed(4) : v; });
  }
  function status() {
    const out = doc.shapes.some(s => { if (!s.visible) return false; const e = extent(s); return e && (e[0] < -doc.fieldW / 2 - 1e-6 || e[2] > doc.fieldW / 2 + 1e-6 || e[1] < -doc.fieldH / 2 - 1e-6 || e[3] > doc.fieldH / 2 + 1e-6); });
    const s = selShape(), e = s && extent(s);
    $('td-status').innerHTML = [e ? tr('Sélection : {w} × {h} mm', { w: nf(e[2] - e[0], 2), h: nf(e[3] - e[1], 2) }) : '',
      tr('{n} forme(s)', { n: doc.shapes.length }), out ? `<b class="bad">${tr('Hors du champ de marquage ({w} × {h} mm) !', { w: nf(doc.fieldW, 0), h: nf(doc.fieldH, 0) })}</b>` : ''].filter(Boolean).join(' · ');
  }

  /* ======================= job ======================= */
  const JOB_FIELDS = [F('name', 'Nom du travail', 'text'), F('plateW', 'Plaque X (mm)'), F('plateH', 'Plaque Y (mm)'), F('wcx', 'Centre du travail X (repère machine)'),
    F('wcy', 'Centre du travail Y (repère machine)'), F('fieldW', 'Champ X (mm)'), F('fieldH', 'Champ Y (mm)'), F('machineDir', 'Dossier des ISO vu par la machine', 'text'),
    F('optimize', 'Optimiser l\'ordre des tracés', 'check'), F('group', 'Grouper les formes par process', 'check')];
  function renderJobForm() {
    $('td-job-fields').innerHTML = JOB_FIELDS.map(f => input(f, doc[f.k], 'j')).join('');
    $('td-job-fields').querySelectorAll('[data-g]').forEach(el => el.addEventListener('change', () => {
      doc[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? +el.value : el.value; commit();
    }));
  }
  let job = null;
  $('td-gen').addEventListener('click', () => {
    job = makeJob();
    if (!job) { $('td-job-out').innerHTML = `<p class="warn">${tr('Rien à graver : aucune forme visible.')}</p>`; return; }
    const st = jobStats(job.passes);
    $('td-job-out').innerHTML = `<p>${tr('{n} passe(s) · gravé {l} mm · à vide {v} mm · durée estimée {d}', { n: job.passes.length, l: nf(st.L, 0), v: nf(st.T, 0), d: dur(st.D) })}</p>
      <ul class="files">${job.files.map((f, i) => `<li><code>${esc(f.name)}</code> <small>${nf(f.text.length / 1024, 1)} ko</small> <button type="button" data-dl="${i}">${tr('Télécharger')}</button></li>`).join('')}</ul>
      <div class="addbar"><button type="button" class="primary" id="td-zip">${tr('Télécharger le job (.zip)')}</button><button type="button" id="td-to-viewer">${tr('Voir dans le visualiseur')}</button></div>
      <p class="muted small">${tr('Copie le dossier dans « {d} » (ou change ce chemin), puis ouvre le .CLJOB dans ClTerm. Vérifie toujours le job avant gravure.', { d: esc(doc.machineDir || '…') })}</p>`;
    $('td-job-out').querySelectorAll('[data-dl]').forEach(b => b.onclick = () => { const f = job.files[+b.dataset.dl]; download(f.name, f.text); });
    $('td-zip').onclick = zipJob;
    $('td-to-viewer').onclick = () => { viewerLoad(job.files.filter(f => /\.ISO$/.test(f.name)).map(f => ({ name: f.name, text: f.text }))); $('sec-td-viewer').scrollIntoView({ behavior: 'smooth' }); };
    viewerLoad(job.files.filter(f => /\.ISO$/.test(f.name)).map(f => ({ name: f.name, text: f.text })));
  });
  async function zipJob() {
    if (!window.JSZip) { alert(tr('Bibliothèque de compression indisponible : télécharge les fichiers un par un.')); return; }
    const z = new JSZip(), d = new Date(), p = n => String(n).padStart(2, '0'), folder = `${job.stem}_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
    job.files.forEach(f => z.file(`${folder}/${f.name}`, f.text));
    download(folder + '.zip', await z.generateAsync({ type: 'blob' }));
  }
  const dur = s => (s < 60 ? `${nf(s, 1)} s` : `${Math.floor(s / 60)} min ${String(Math.round(s % 60)).padStart(2, '0')} s`);

  /* ======================= visualiseur de job ======================= */
  const vc = $('td-vcv'), vx = vc.getContext('2d'), vpre = $('td-vcode');
  let vfiles = [], vsegs = [], vtotal = 0, vpos = 1, vplay = false, vlast = 0, vcur = -1, vbounds = null;
  function parseISO(text, fi) {
    const lines = text.replace(/\r/g, '').split('\n'), segs = []; let x = 0, y = 0, z = -0.001, F = 0, P = 0, I = 0;
    lines.forEach((raw, li) => {
      const l = raw.replace(/\([^)]*\)/g, '').trim(); if (!l) return;
      const g = l.match(/^G(\d+)/), gv = g ? +g[1] : null, v = k => { const m = l.match(new RegExp(k + '(-?\\d*\\.?\\d+)')); return m ? +m[1] : null; };
      if (gv === 108) { P = v('P') ?? P; I = v('I') ?? I; return; }
      if (/^F/.test(l)) { F = v('F') ?? F; return; }
      if (gv === 0 || gv === 1) {
        const nx = v('X') ?? x, ny = v('Y') ?? y, nz = v('Z') ?? z;
        if (nx !== x || ny !== y) segs.push({ a: [x, y], b: [nx, ny], cut: gv === 1, f: fi, line: li, F });
        x = nx; y = ny; z = nz;
      }
    });
    return { lines, segs, P, I };
  }
  function viewerLoad(files) {
    vfiles = files.map((f, i) => ({ ...f, ...parseISO(f.text, i) })); vsegs = []; vtotal = 0;
    vfiles.forEach(f => f.segs.forEach(s => { s.L = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]); s.s = vtotal; vtotal += s.L; vsegs.push(s); }));
    vbounds = G.bounds(vsegs.flatMap(s => [[s.a, s.b]]).flat().map(p => [p]));
    $('td-vsel').innerHTML = `<option value="-1">${tr('Toutes les passes')}</option>` + vfiles.map((f, i) => `<option value="${i}">${esc(f.name)}</option>`).join('');
    let L = 0, T = 0, D = 0; vsegs.forEach(s => { if (s.cut) { L += s.L; D += s.F > 0 ? s.L / s.F * 60 : 0; } else { T += s.L; D += s.L / RAPID * 60; } });
    $('td-vstats').textContent = vfiles.length ? tr('{f} fichier(s) · gravé {l} mm · à vide {v} mm · durée estimée {d}', { f: vfiles.length, l: nf(L, 0), v: nf(T, 0), d: dur(D) }) : '';
    showCode(vfiles.length ? 0 : -1); vpos = 1; $('td-vpos').value = 1000; vstop(); vdraw();
  }
  function showCode(i) {
    const f = vfiles[i]; vcur = -1;
    vpre.innerHTML = f ? f.lines.slice(0, 4000).map((l, k) => `<div data-l="${k}">${esc(l) || ' '}</div>`).join('') + (f.lines.length > 4000 ? `<div>… ${tr('{n} lignes', { n: f.lines.length })}</div>` : '') : '';
    vpre.dataset.f = i;
  }
  const PAL = ['--brass', '--rapid', '--ink', '--brass-l'];
  function vdraw() {
    const r = vc.getBoundingClientRect(), d = devicePixelRatio || 1; vc.width = r.width * d; vc.height = r.height * d; vx.setTransform(d, 0, 0, d, 0, 0); vx.clearRect(0, 0, r.width, r.height);
    if (!vsegs.length || !vbounds) { vx.fillStyle = css('--mute'); vx.font = '14px Barlow,sans-serif'; vx.fillText(tr('Génère un job ou ouvre des fichiers .ISO.'), 14, 26); return; }
    const only = +$('td-vsel').value, [x0, y0, x1, y1] = [Math.min(vbounds[0], -doc.fieldW / 2), Math.min(vbounds[1], -doc.fieldH / 2), Math.max(vbounds[2], doc.fieldW / 2), Math.max(vbounds[3], doc.fieldH / 2)];
    const pad = 16, k = Math.min((r.width - 2 * pad) / (x1 - x0), (r.height - 2 * pad) / (y1 - y0)), ox = (r.width - (x1 - x0) * k) / 2, oy = (r.height - (y1 - y0) * k) / 2;
    const X = x => ox + (x - x0) * k, Y = y => r.height - oy - (y - y0) * k;
    vx.strokeStyle = css('--line'); vx.setLineDash([6, 4]); vx.strokeRect(X(-doc.fieldW / 2), Y(doc.fieldH / 2), doc.fieldW * k, doc.fieldH * k); vx.setLineDash([]);
    const lim = vpos * vtotal; let tool = vsegs[0].a, cur = vsegs[0];
    vx.lineCap = 'round';
    for (const s of vsegs) {
      if (s.s >= lim) break;
      const f = Math.min(1, (lim - s.s) / (s.L || 1)), b = [s.a[0] + (s.b[0] - s.a[0]) * f, s.a[1] + (s.b[1] - s.a[1]) * f];
      tool = b; cur = s;
      if (only >= 0 && s.f !== only) continue;
      if (s.cut) { vx.strokeStyle = css(PAL[s.f % PAL.length]) || css('--brass'); vx.globalAlpha = 1; vx.lineWidth = 1.3; vx.setLineDash([]); }
      else { if (!$('td-vrapid').checked) continue; vx.strokeStyle = css('--mute'); vx.globalAlpha = 0.45; vx.lineWidth = 0.7; vx.setLineDash([3, 3]); }
      vx.beginPath(); vx.moveTo(X(s.a[0]), Y(s.a[1])); vx.lineTo(X(b[0]), Y(b[1])); vx.stroke();
    }
    vx.globalAlpha = 1; vx.setLineDash([]); vx.fillStyle = css('--ink'); vx.beginPath(); vx.arc(X(tool[0]), Y(tool[1]), 4, 0, 7); vx.fill();
    vx.fillStyle = css('--mute'); vx.font = '13px Barlow,sans-serif'; vx.fillText(`${vfiles[cur.f].name} · X ${tool[0].toFixed(3)}  Y ${tool[1].toFixed(3)}`, 10, r.height - 10);
    if (+vpre.dataset.f !== cur.f) showCode(cur.f);
    if (cur.line !== vcur) { vpre.querySelector('.cur')?.classList.remove('cur'); const el = vpre.querySelector(`[data-l="${cur.line}"]`); if (el) { el.classList.add('cur'); if (vplay) vpre.scrollTop = el.offsetTop - vpre.clientHeight / 2; } vcur = cur.line; }
  }
  function vtick(tm) { if (!vplay) return; const dt = (tm - vlast) / 1000; vlast = tm; const d = Math.max(6, Math.min(60, vtotal / 60)) / (+$('td-vspeed').value);
    vpos = Math.min(1, vpos + dt / d); $('td-vpos').value = vpos * 1000; vdraw(); if (vpos >= 1) vstop(); else requestAnimationFrame(vtick); }
  function vstop() { vplay = false; $('td-vplay').textContent = tr('Lire'); }
  $('td-vplay').onclick = () => { if (vplay) return vstop(); if (!vsegs.length) return; if (vpos >= 1) vpos = 0; vplay = true; $('td-vplay').textContent = tr('Pause'); vlast = performance.now(); requestAnimationFrame(vtick); };
  $('td-vpos').oninput = e => { vstop(); vpos = e.target.value / 1000; vdraw(); };
  $('td-vsel').onchange = () => { const i = +$('td-vsel').value; if (i >= 0) showCode(i); vdraw(); };
  $('td-vrapid').onchange = vdraw;
  $('td-vopen').onclick = () => $('td-viso-file').click();
  $('td-viso-file').onchange = e => { const fs = [...e.target.files].filter(f => /\.iso$/i.test(f.name) || /\.nc$|\.txt$/i.test(f.name)).sort((a, b) => a.name.localeCompare(b.name)); e.target.value = '';
    if (!fs.length) return; Promise.all(fs.map(f => f.text().then(text => ({ name: f.name, text })))).then(viewerLoad); };

  /* ======================= démarrage ======================= */
  load();
  renderJobForm(); refreshPanel();
  const ro = new ResizeObserver(() => { if (!fitted) fitView(); redraw(); vdraw(); }); ro.observe(cv); ro.observe(vc);
  requestAnimationFrame(() => { fitView(); vdraw(); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { redraw(); vdraw(); });
  addEventListener('resize', () => { redraw(); vdraw(); });
  document.addEventListener('stockage-change', e => { if (e.detail === 'oui') save(); });
  window.addEventListener('opentype-ready', () => { clearCache(); redraw(); });
  window.TauDrive = { get doc() { return doc; }, buildPasses, makeJob, G, offsetContours };   // tests
})();
