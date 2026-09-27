/* Lecture et écriture de dessins vectoriels, dans le navigateur (TauDrive web, TauConvert en ligne).
   Entrées : DXF, SVG, PDF et AI (Illustrator 9+ = PDF), EPS / AI anciens (PostScript simple).
   Sorties : DXF (R12), SVG, EPS, PDF. Unités : mm, Y vers le haut. Tracés = polylignes [[x, y], …]. */
(function () {
  'use strict';
  const tr = (s, v) => (window.t ? window.t(s, v) : s);
  const PT = 25.4 / 72, PX = 25.4 / 96;
  const closed = p => p.length > 2 && Math.abs(p[0][0] - p[p.length - 1][0]) < 1e-9 && Math.abs(p[0][1] - p[p.length - 1][1]) < 1e-9;
  function bounds(polys) {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const p of polys) for (const [x, y] of p) { if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y; }
    return x1 === Infinity ? null : [x1, y1, x2, y2];
  }
  // courbes → segments (tolérance ≈ 0,02 mm)
  const nSeg = (len, tol = 0.02) => Math.max(2, Math.min(64, Math.ceil(Math.sqrt(Math.max(len, 0) / tol))));
  function cubic(out, p0, p1, p2, p3) {
    const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) + Math.hypot(p3[0] - p2[0], p3[1] - p2[1]);
    const n = nSeg(len);
    for (let k = 1; k <= n; k++) { const t = k / n, u = 1 - t;
      out.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]); }
  }
  function quad(out, p0, p1, p2) { cubic(out, p0, [p0[0] + 2 / 3 * (p1[0] - p0[0]), p0[1] + 2 / 3 * (p1[1] - p0[1])], [p2[0] + 2 / 3 * (p1[0] - p2[0]), p2[1] + 2 / 3 * (p1[1] - p2[1])], p2); }
  function circle(r, cx, cy) { const n = Math.max(24, Math.min(720, Math.ceil(2 * Math.PI * r / 0.1))), o = []; for (let k = 0; k <= n; k++) { const a = 2 * Math.PI * k / n; o.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } o[n] = o[0].slice(); return o; }

  /* raccorde les tracés bout à bout (grille de recherche), indispensable au hachurage pair-impair */
  function join(polys, tol = 1e-3) {
    const items = polys.filter(p => p.length >= 2).map(p => p.slice()), used = new Array(items.length).fill(false), grid = new Map();
    const key = (x, y) => Math.round(x / tol) + ',' + Math.round(y / tol);
    const near = (x, y) => { const cx = Math.round(x / tol), cy = Math.round(y / tol), out = []; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const l = grid.get((cx + a) + ',' + (cy + b)); if (l) out.push(...l); } return out; };
    items.forEach((p, i) => { if (closed(p)) return; for (const [e, end] of [[p[0], 0], [p[p.length - 1], 1]]) { const k = key(e[0], e[1]); if (!grid.has(k)) grid.set(k, []); grid.get(k).push([i, end]); } });
    const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]), out = [];
    const take = (pt, self) => { for (const [i, end] of near(pt[0], pt[1])) { if (used[i] || i === self) continue; const q = items[i], e = end ? q[q.length - 1] : q[0]; if (d(e, pt) < tol) { used[i] = true; return end ? q.slice().reverse() : q; } } return null; };
    items.forEach((p, i) => {
      if (used[i]) return; used[i] = true;
      if (!closed(p)) {
        let q; while (!closed(p) && (q = take(p[p.length - 1], i))) p = p.concat(q.slice(1));
        while (!closed(p) && (q = take(p[0], i))) p = q.slice().reverse().slice(0, -1).concat(p);
        if (p.length > 2 && d(p[0], p[p.length - 1]) < tol) p[p.length - 1] = p[0].slice();
      }
      out.push(p);
    });
    return out;
  }

  /* ======================= DXF ======================= */
  function readDXF(text) {
    const L = text.replace(/\r/g, '').split('\n'), pr = [];
    for (let i = 0; i + 1 < L.length; i += 2) pr.push([parseInt(L[i], 10), L[i + 1].trim()]);
    let units = 0; const hi = pr.findIndex(([c, v]) => c === 9 && v === '$INSUNITS'); if (hi >= 0 && pr[hi + 1]) units = +pr[hi + 1][1];
    const off = new Set();
    let i = pr.findIndex(([c, v], k) => c === 2 && v === 'ENTITIES' && pr[k - 1] && pr[k - 1][1] === 'SECTION');
    for (let k = 0; k < (i < 0 ? pr.length : i); k++) if (pr[k][0] === 0 && pr[k][1] === 'LAYER') {
      let name = '', col = 0, flags = 0;
      for (let j = k + 1; j < pr.length && pr[j][0] !== 0; j++) { if (pr[j][0] === 2) name = pr[j][1]; if (pr[j][0] === 62) col = +pr[j][1]; if (pr[j][0] === 70) flags = +pr[j][1]; }
      if (col < 0 || (flags & 1) || /^defpoints$/i.test(name)) off.add(name);
    }
    if (i < 0) i = 0;
    const ents = []; let cur = null, poly = null;
    const flush = () => { if (cur) ents.push(cur); cur = null; };
    for (i++; i < pr.length; i++) {
      const [c, v] = pr[i];
      if (c === 0) {
        if (v === 'ENDSEC') { flush(); break; }
        if (v === 'VERTEX' && poly) { flush(); cur = { t: 'VERTEX', owner: poly }; continue; }
        if (v === 'SEQEND') { flush(); if (poly) ents.push(poly); poly = null; continue; }
        flush();
        if (v === 'POLYLINE') { poly = { t: 'POLY', v: [], closed: false, layer: '0' }; continue; }
        cur = { t: v, v: [], k: [], cp: [], fp: [], layer: '0' }; continue;
      }
      if (!cur && poly) { if (c === 70) poly.closed = (+v & 1) === 1; if (c === 8) poly.layer = v; continue; }
      if (!cur) continue;
      const n = parseFloat(v);
      if (c === 8 && cur.t !== 'VERTEX') { cur.layer = v; continue; }
      if (cur.t === 'VERTEX') { const o = cur.owner.v; if (c === 10) o.push({ x: n, y: 0, b: 0 }); else if (c === 20) o[o.length - 1].y = n; else if (c === 42) o[o.length - 1].b = n; }
      else if (cur.t === 'LWPOLYLINE') { if (c === 10) cur.v.push({ x: n, y: 0, b: 0 }); else if (c === 20) cur.v[cur.v.length - 1].y = n; else if (c === 42) cur.v[cur.v.length - 1].b = n; else if (c === 70) cur.closed = (+v & 1) === 1; }
      else if (cur.t === 'SPLINE') {
        if (c === 10) cur.cp.push([n, 0]); else if (c === 20) cur.cp[cur.cp.length - 1][1] = n;
        else if (c === 11) cur.fp.push([n, 0]); else if (c === 21) cur.fp[cur.fp.length - 1][1] = n;
        else if (c === 40) cur.k.push(n); else if (c === 71) cur.deg = n; else if (c === 70) cur.flags = n;
      } else cur[c] = n;
    }
    const arc = (cx, cy, r, a0, a1) => { while (a1 <= a0) a1 += 360; const n = Math.max(8, Math.ceil((a1 - a0) / 3)), o = [];
      for (let k = 0; k <= n; k++) { const a = (a0 + (a1 - a0) * k / n) * Math.PI / 180; o.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } return o; };
    const bulge = (vs, cl) => {
      const o = [[vs[0].x, vs[0].y]], n = vs.length;
      for (let k = 0; k < (cl ? n : n - 1); k++) {
        const a = vs[k], b = vs[(k + 1) % n];
        if (Math.abs(a.b) > 1e-9) {                      // bulge = tan(angle/4), positif = sens trigonométrique
          const th = 4 * Math.atan(a.b), f = (1 - a.b * a.b) / (4 * a.b), dx = b.x - a.x, dy = b.y - a.y;
          const cx = (a.x + b.x) / 2 - dy * f, cy = (a.y + b.y) / 2 + dx * f, r = Math.hypot(a.x - cx, a.y - cy), a0 = Math.atan2(a.y - cy, a.x - cx), st = Math.max(4, Math.ceil(Math.abs(th) / 0.05));
          for (let s = 1; s < st; s++) { const t = a0 + th * s / st; o.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]); }
        }
        o.push([b.x, b.y]);
      }
      return o;
    };
    const deBoor = e => {
      const p = e.deg || 3, cp = e.cp, k = e.k;
      if (!cp.length) return e.fp;
      if (k.length !== cp.length + p + 1) return cp;
      const o = [], n = Math.max(16, cp.length * 12), t0 = k[p], t1 = k[cp.length];
      for (let s = 0; s <= n; s++) {
        const t = s === n ? t1 - 1e-9 : t0 + (t1 - t0) * s / n; let j = p; while (j < cp.length - 1 && t >= k[j + 1]) j++;
        const d = []; for (let r = 0; r <= p; r++) d.push(cp[j - p + r].slice());
        for (let r = 1; r <= p; r++) for (let q = p; q >= r; q--) { const al = (t - k[j - p + q]) / ((k[j + 1 + q - r] - k[j - p + q]) || 1); d[q] = [(1 - al) * d[q - 1][0] + al * d[q][0], (1 - al) * d[q - 1][1] + al * d[q][1]]; }
        o.push(d[p]);
      }
      return o;
    };
    const items = [], ignored = new Set();
    for (const e of ents) {
      let p = null;
      if (e.t === 'LINE') p = [[e[10], e[20]], [e[11], e[21]]];
      else if (e.t === 'ARC') p = arc(e[10], e[20], e[40], e[50], e[51]);
      else if (e.t === 'CIRCLE') p = circle(e[40], e[10], e[20]);
      else if (e.t === 'ELLIPSE') {
        const cx = e[10], cy = e[20], mx = e[11], my = e[21], ra = e[40], a0 = e[41] || 0, a1 = e[42] === undefined ? 2 * Math.PI : e[42];
        const R = Math.hypot(mx, my), rot = Math.atan2(my, mx), b = R * ra; let t1 = a1; while (t1 <= a0) t1 += 2 * Math.PI;
        const n = Math.max(24, Math.ceil((t1 - a0) / 0.04)); p = [];
        for (let k = 0; k <= n; k++) { const t = a0 + (t1 - a0) * k / n, x = R * Math.cos(t), y = b * Math.sin(t); p.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]); }
      } else if (e.t === 'LWPOLYLINE' || e.t === 'POLY') { if (e.v.length >= 2) { p = bulge(e.v, e.closed); if (e.closed && !closed(p)) p.push(p[0].slice()); } }
      else if (e.t === 'SPLINE') { p = deBoor(e); if ((e.flags & 1) && p.length > 2 && !closed(p)) p.push(p[0].slice()); }
      else if (e.t !== 'VERTEX') ignored.add(e.t);
      if (p && p.length >= 2) items.push({ layer: e.layer || '0', poly: p });
    }
    const k = { 1: 25.4, 4: 1, 5: 10, 6: 1000 }[units];
    return { items: items.filter(o => !off.has(o.layer)), units, unitScale: k || 1, ignored: [...ignored] };
  }

  /* ======================= SVG ======================= */
  const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
  const apply = (m, [x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  function parseTransform(s) {
    let m = [1, 0, 0, 1, 0, 0];
    for (const [, f, args] of String(s || '').matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
      const a = args.split(/[\s,]+/).filter(Boolean).map(Number);
      let t = [1, 0, 0, 1, 0, 0];
      if (f === 'matrix') t = a.slice(0, 6);
      else if (f === 'translate') t = [1, 0, 0, 1, a[0] || 0, a[1] || 0];
      else if (f === 'scale') t = [a[0], 0, 0, a[1] ?? a[0], 0, 0];
      else if (f === 'rotate') { const r = a[0] * Math.PI / 180, c = Math.cos(r), s2 = Math.sin(r); t = [c, s2, -s2, c, 0, 0]; if (a.length > 2) t = mul(mul([1, 0, 0, 1, a[1], a[2]], t), [1, 0, 0, 1, -a[1], -a[2]]); }
      else if (f === 'skewX') t = [1, 0, Math.tan(a[0] * Math.PI / 180), 1, 0, 0];
      else if (f === 'skewY') t = [1, Math.tan(a[0] * Math.PI / 180), 0, 1, 0, 0];
      m = mul(m, t);
    }
    return m;
  }
  function svgArc(out, p0, rx, ry, phi, fa, fs, p1) {      // SVG 1.1, annexe F.6
    if (!rx || !ry) { out.push(p1); return; }
    rx = Math.abs(rx); ry = Math.abs(ry); const f = phi * Math.PI / 180, c = Math.cos(f), s = Math.sin(f);
    const dx = (p0[0] - p1[0]) / 2, dy = (p0[1] - p1[1]) / 2, x1 = c * dx + s * dy, y1 = -s * dx + c * dy;
    const lam = x1 * x1 / (rx * rx) + y1 * y1 / (ry * ry); if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
    const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1, den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
    const co = (fa === fs ? -1 : 1) * Math.sqrt(Math.max(0, num / den)), cx1 = co * rx * y1 / ry, cy1 = -co * ry * x1 / rx;
    const cx = c * cx1 - s * cy1 + (p0[0] + p1[0]) / 2, cy = s * cx1 + c * cy1 + (p0[1] + p1[1]) / 2;
    const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    const t1 = ang(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry); let dt = ang((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
    if (!fs && dt > 0) dt -= 2 * Math.PI; else if (fs && dt < 0) dt += 2 * Math.PI;
    const n = Math.max(4, Math.ceil(Math.abs(dt) * Math.max(rx, ry) / 0.3));
    for (let k = 1; k <= n; k++) { const t = t1 + dt * k / n; out.push([cx + rx * Math.cos(t) * c - ry * Math.sin(t) * s, cy + rx * Math.cos(t) * s + ry * Math.sin(t) * c]); }
  }
  function pathD(d) {
    const tok = String(d).match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) || [], polys = [];
    let i = 0, cmd = '', cur = [0, 0], start = [0, 0], poly = null, lastC = null, lastQ = null;
    const n = () => +tok[i++], isNum = () => i < tok.length && !/^[a-zA-Z]$/.test(tok[i]);
    const begin = p => { if (poly && poly.length > 1) polys.push(poly); poly = [p]; start = p; };
    while (i < tok.length) {
      if (/^[a-zA-Z]$/.test(tok[i])) cmd = tok[i++];
      const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase(), R = (x, y) => (rel ? [cur[0] + x, cur[1] + y] : [x, y]);
      if (C === 'Z') { if (poly) { poly.push(start.slice()); polys.push(poly); poly = null; } cur = start; lastC = lastQ = null; continue; }
      if (!isNum()) { i++; continue; }
      if (C === 'M') { cur = R(n(), n()); begin(cur); cmd = rel ? 'l' : 'L'; lastC = lastQ = null; continue; }
      if (!poly) begin(cur);
      if (C === 'L') { cur = R(n(), n()); poly.push(cur); lastC = lastQ = null; }
      else if (C === 'H') { cur = [rel ? cur[0] + n() : n(), cur[1]]; poly.push(cur); lastC = lastQ = null; }
      else if (C === 'V') { cur = [cur[0], rel ? cur[1] + n() : n()]; poly.push(cur); lastC = lastQ = null; }
      else if (C === 'C') { const a = R(n(), n()), b = R(n(), n()), e = R(n(), n()); cubic(poly, cur, a, b, e); lastC = b; lastQ = null; cur = e; }
      else if (C === 'S') { const a = lastC ? [2 * cur[0] - lastC[0], 2 * cur[1] - lastC[1]] : cur, b = R(n(), n()), e = R(n(), n()); cubic(poly, cur, a, b, e); lastC = b; lastQ = null; cur = e; }
      else if (C === 'Q') { const a = R(n(), n()), e = R(n(), n()); quad(poly, cur, a, e); lastQ = a; lastC = null; cur = e; }
      else if (C === 'T') { const a = lastQ ? [2 * cur[0] - lastQ[0], 2 * cur[1] - lastQ[1]] : cur, e = R(n(), n()); quad(poly, cur, a, e); lastQ = a; lastC = null; cur = e; }
      else if (C === 'A') { const rx = n(), ry = n(), ph = n(), fa = n(), fs = n(), e = R(n(), n()); svgArc(poly, cur, rx, ry, ph, !!fa, !!fs, e); cur = e; lastC = lastQ = null; }
      else i++;
    }
    if (poly && poly.length > 1) polys.push(poly);
    return polys;
  }
  const unitMM = v => { const m = String(v || '').match(/^\s*([\d.]+)\s*(mm|cm|in|pt|pc|px)?\s*$/); if (!m) return null; return +m[1] * ({ mm: 1, cm: 10, in: 25.4, pt: PT, pc: 12 * PT, px: PX }[m[2] || 'px']); };
  function readSVG(text) {
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml'), svg = doc.documentElement;
    if (!svg || svg.nodeName.toLowerCase() !== 'svg') throw new Error(tr('SVG illisible'));
    const vb = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number), wmm = unitMM(svg.getAttribute('width')), hmm = unitMM(svg.getAttribute('height'));
    let sx = PX, sy = PX, ox = 0, oy = 0;
    if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) { sx = wmm ? wmm / vb[2] : PX; sy = hmm ? hmm / vb[3] : sx; ox = vb[0]; oy = vb[1]; }
    else if (wmm && +svg.getAttribute('width')) { sx = sy = wmm / parseFloat(svg.getAttribute('width')); }
    const items = [], ignored = new Set();
    const toMM = m => p => { const [x, y] = apply(m, p); return [(x - ox) * sx, -(y - oy) * sy]; };
    const walk = (el, m) => {
      for (const c of el.children) {
        const tag = c.nodeName.toLowerCase().replace(/^svg:/, '');
        if (['defs', 'clippath', 'mask', 'symbol', 'metadata', 'title', 'desc', 'style', 'pattern', 'lineargradient', 'radialgradient'].includes(tag)) continue;
        if (c.getAttribute('display') === 'none' || /display\s*:\s*none/.test(c.getAttribute('style') || '')) continue;
        const mm = mul(m, parseTransform(c.getAttribute('transform'))), g = a => parseFloat(c.getAttribute(a)) || 0, layer = c.closest('g[id]')?.id || '0';
        let polys = null;
        if (tag === 'g' || tag === 'a' || tag === 'svg') { walk(c, mm); continue; }
        if (tag === 'path') polys = pathD(c.getAttribute('d'));
        else if (tag === 'rect') { const x = g('x'), y = g('y'), w = g('width'), h = g('height'); let rx = g('rx') || g('ry'), ry = g('ry') || rx; rx = Math.min(rx, w / 2); ry = Math.min(ry, h / 2);
          polys = rx > 0 ? pathD(`M${x + rx},${y} H${x + w - rx} A${rx},${ry} 0 0 1 ${x + w},${y + ry} V${y + h - ry} A${rx},${ry} 0 0 1 ${x + w - rx},${y + h} H${x + rx} A${rx},${ry} 0 0 1 ${x},${y + h - ry} V${y + ry} A${rx},${ry} 0 0 1 ${x + rx},${y} Z`)
            : [[[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]]; }
        else if (tag === 'circle' || tag === 'ellipse') { const cx = g('cx'), cy = g('cy'), rx = tag === 'circle' ? g('r') : g('rx'), ry = tag === 'circle' ? g('r') : g('ry');
          polys = pathD(`M${cx + rx},${cy} A${rx},${ry} 0 0 1 ${cx - rx},${cy} A${rx},${ry} 0 0 1 ${cx + rx},${cy} Z`); }
        else if (tag === 'line') polys = [[[g('x1'), g('y1')], [g('x2'), g('y2')]]];
        else if (tag === 'polyline' || tag === 'polygon') { const v = (c.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number), p = []; for (let k = 0; k + 1 < v.length; k += 2) p.push([v[k], v[k + 1]]); if (tag === 'polygon' && p.length) p.push(p[0].slice()); polys = [p]; }
        else { ignored.add(tag); continue; }
        for (const p of polys) if (p.length >= 2) items.push({ layer, poly: p.map(toMM(mm)) });
      }
    };
    walk(svg, [1, 0, 0, 1, 0, 0]);
    return { items, ignored: [...ignored] };
  }

  /* ======================= PDF / AI (pdf.js) ======================= */
  function pdfjs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    return new Promise((ok, ko) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      s.onload = () => { pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; ok(pdfjsLib); };
      s.onerror = () => ko(new Error(tr('pdf.js indisponible'))); document.head.append(s); });
  }
  async function readPDF(buffer) {
    const lib = await pdfjs(), O = lib.OPS, pdf = await lib.getDocument({ data: new Uint8Array(buffer) }).promise, items = [];
    for (let pn = 1; pn <= pdf.numPages; pn++) {
      const page = await pdf.getPage(pn), ol = await page.getOperatorList();
      let m = [1, 0, 0, 1, 0, 0]; const stack = [];
      const P = (x, y) => { const [a, b] = apply(m, [x, y]); return [a * PT, b * PT]; };
      for (let k = 0; k < ol.fnArray.length; k++) {
        const fn = ol.fnArray[k], a = ol.argsArray[k];
        if (fn === O.save) stack.push(m.slice());
        else if (fn === O.restore) m = stack.pop() || m;
        else if (fn === O.transform) m = mul(m, a);
        else if (fn === O.paintFormXObjectBegin) { stack.push(m.slice()); if (a[0]) m = mul(m, a[0]); }
        else if (fn === O.paintFormXObjectEnd) m = stack.pop() || m;
        else if (fn === O.constructPath) {
          const ops = a[0], c = a[1]; let j = 0, poly = null, cur = [0, 0], st = [0, 0];
          const end = () => { if (poly && poly.length > 1) items.push({ layer: pdf.numPages > 1 ? tr('page {n}', { n: pn }) : '0', poly }); poly = null; };
          for (const op of ops) {
            if (op === O.moveTo) { end(); cur = [c[j++], c[j++]]; st = cur; poly = [P(...cur)]; }
            else if (op === O.lineTo) { cur = [c[j++], c[j++]]; (poly = poly || [P(...st)]).push(P(...cur)); }
            else if (op === O.curveTo) { const p1 = [c[j++], c[j++]], p2 = [c[j++], c[j++]], p3 = [c[j++], c[j++]]; poly = poly || [P(...cur)]; cubic(poly, P(...cur), P(...p1), P(...p2), P(...p3)); cur = p3; }
            else if (op === O.curveTo2) { const p2 = [c[j++], c[j++]], p3 = [c[j++], c[j++]]; poly = poly || [P(...cur)]; cubic(poly, P(...cur), P(...cur), P(...p2), P(...p3)); cur = p3; }
            else if (op === O.curveTo3) { const p1 = [c[j++], c[j++]], p3 = [c[j++], c[j++]]; poly = poly || [P(...cur)]; cubic(poly, P(...cur), P(...p1), P(...p3), P(...p3)); cur = p3; }
            else if (op === O.closePath) { if (poly) { poly.push(poly[0].slice()); } end(); cur = st; }
            else if (op === O.rectangle) { end(); const x = c[j++], y = c[j++], w = c[j++], h = c[j++]; items.push({ layer: '0', poly: [P(x, y), P(x + w, y), P(x + w, y + h), P(x, y + h), P(x, y)] }); }
          }
          end();
        }
      }
    }
    return { items, ignored: [] };
  }

  /* ======================= EPS / PostScript (tracés simples) ======================= */
  function readEPS(buffer) {
    let bytes = new Uint8Array(buffer);
    if (bytes[0] === 0xC5 && bytes[1] === 0xD0 && bytes[2] === 0xD3 && bytes[3] === 0xC6) {      // en-tête binaire DOS
      const dv = new DataView(buffer), off = dv.getUint32(4, true), len = dv.getUint32(8, true); bytes = bytes.subarray(off, off + len);
    }
    let text = new TextDecoder('latin1').decode(bytes);
    // prologue et données binaires ignorés : seules les procédures de tracé comptent
    text = text.replace(/%%BeginProlog[\s\S]*?%%EndProlog/g, ' ').replace(/%%BeginData[\s\S]*?%%EndData/g, ' ').replace(/%%BeginBinary[\s\S]*?%%EndBinary/g, ' ')
      .replace(/%%BeginResource[\s\S]*?%%EndResource/g, ' ').replace(/%[^\n\r]*/g, ' ');
    const toks = text.match(/\(|\)|\{|\}|\[|\]|<<|>>|<[0-9a-fA-F\s]*>|\/?[^\s(){}\[\]<>/%]+/g) || [];
    const st = [], items = [], gs = []; let m = [1, 0, 0, 1, 0, 0], cur = null, start = null, poly = null, depth = 0, str = 0;
    const P = p => { const [x, y] = apply(m, p); return [x * PT, y * PT]; };
    const end = () => { if (poly && poly.length > 1) items.push({ layer: '0', poly }); poly = null; };
    const nums = k => { const a = st.splice(-k); return a.length === k && a.every(v => typeof v === 'number') ? a : null; };
    for (const t of toks) {
      if (t === '(') { str++; continue; } if (str) { if (t === ')') str--; continue; }
      if (t === '{') { depth++; continue; } if (t === '}') { depth = Math.max(0, depth - 1); continue; } if (depth) continue;
      if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) { st.push(+t); continue; }
      if (t[0] === '/' || t === '[' || t === ']' || t === '<<' || t === '>>' || t[0] === '<') { st.push(t); continue; }
      let a;
      switch (t) {
        case 'moveto': case 'm': if ((a = nums(2))) { end(); cur = start = a; poly = [P(a)]; } break;
        case 'rmoveto': if ((a = nums(2)) && cur) { end(); cur = start = [cur[0] + a[0], cur[1] + a[1]]; poly = [P(cur)]; } break;
        case 'lineto': case 'l': case 'L': if ((a = nums(2))) { if (!poly && cur) poly = [P(cur)]; cur = a; (poly = poly || []).push(P(a)); } break;
        case 'rlineto': if ((a = nums(2)) && cur) { cur = [cur[0] + a[0], cur[1] + a[1]]; (poly = poly || [P(start)]).push(P(cur)); } break;
        case 'curveto': case 'c': case 'C': if ((a = nums(6)) && cur) { poly = poly || [P(cur)]; cubic(poly, P(cur), P([a[0], a[1]]), P([a[2], a[3]]), P([a[4], a[5]])); cur = [a[4], a[5]]; } break;
        case 'rcurveto': if ((a = nums(6)) && cur) { const [x, y] = cur; poly = poly || [P(cur)]; cubic(poly, P(cur), P([x + a[0], y + a[1]]), P([x + a[2], y + a[3]]), P([x + a[4], y + a[5]])); cur = [x + a[4], y + a[5]]; } break;
        case 'v': case 'V': if ((a = nums(4)) && cur) { poly = poly || [P(cur)]; cubic(poly, P(cur), P(cur), P([a[0], a[1]]), P([a[2], a[3]])); cur = [a[2], a[3]]; } break;
        case 'y': case 'Y': if ((a = nums(4)) && cur) { poly = poly || [P(cur)]; cubic(poly, P(cur), P([a[0], a[1]]), P([a[2], a[3]]), P([a[2], a[3]])); cur = [a[2], a[3]]; } break;
        case 'closepath': case 'h': case 'H': case 'cp': if (poly && start) { poly.push(P(start)); cur = start; } end(); break;
        case 're': case 'rectfill': case 'rectstroke': case 'rectclip': if ((a = nums(4)) && t !== 'rectclip') { end(); const [x, y, w, h] = a; items.push({ layer: '0', poly: [P([x, y]), P([x + w, y]), P([x + w, y + h]), P([x, y + h]), P([x, y])] }); } break;
        case 'translate': if ((a = nums(2))) m = mul(m, [1, 0, 0, 1, a[0], a[1]]); break;
        case 'scale': if ((a = nums(2))) m = mul(m, [a[0], 0, 0, a[1], 0, 0]); break;
        case 'rotate': if ((a = nums(1))) { const r = a[0] * Math.PI / 180; m = mul(m, [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]); } break;
        case 'concat': { const e = st.lastIndexOf(']'), b = st.lastIndexOf('['); if (b >= 0 && e > b) { const v = st.slice(b + 1, e); st.length = b; if (v.length === 6) m = mul(m, v); } break; }
        case 'gsave': case 'q': gs.push(m.slice()); break;
        case 'grestore': case 'Q': m = gs.pop() || m; break;
        case 'newpath': case 'n': case 'N': end(); break;
        case 'stroke': case 'fill': case 'eofill': case 'f': case 'F': case 's': case 'S': case 'b': case 'B': case 'clip': case 'eoclip': case 'W': end(); break;
        default: if (st.length > 64) st.splice(0, st.length - 64);
      }
    }
    end();
    return { items, ignored: [] };
  }

  /* ======================= lecture automatique ======================= */
  async function read(file) {
    const name = file.name || '', ext = (name.match(/\.(\w+)$/) || [, ''])[1].toLowerCase(), buf = await file.arrayBuffer(), head = new TextDecoder('latin1').decode(new Uint8Array(buf.slice(0, 1024)));
    let r, format;
    if (head.startsWith('%PDF') || (ext === 'ai' && head.includes('%PDF'))) { r = await readPDF(buf); format = ext === 'ai' ? 'AI (PDF)' : 'PDF'; }
    else if (ext === 'dxf' || /^\s*0\s*\r?\n\s*SECTION/.test(head)) { r = readDXF(new TextDecoder('utf-8').decode(buf)); format = 'DXF'; }
    else if (ext === 'svg' || /<svg[\s>]/i.test(head)) { r = readSVG(new TextDecoder('utf-8').decode(buf)); format = 'SVG'; }
    else if (['eps', 'ps', 'ai', 'epsf'].includes(ext) || head.startsWith('%!') || (new Uint8Array(buf)[0] === 0xC5)) { r = readEPS(buf); format = ext === 'ai' ? 'AI (PostScript)' : 'EPS'; }
    else if (ext === 'cdr') throw new Error(tr('CorelDRAW (.cdr) : exporte en SVG, PDF ou DXF depuis CorelDRAW, ou utilise TauConvert avec Inkscape.'));
    else throw new Error(tr('Format non reconnu : {e}', { e: ext || '?' }));
    return { ...r, format, name: name.replace(/\.\w+$/, '') };
  }

  /* ======================= écriture ======================= */
  const f = (v, d = 4) => (+v).toFixed(d).replace(/\.?0+$/, '') || '0';
  function toDXF(polys) {
    const o = ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES'];
    for (const p of polys) {
      const cl = closed(p), pts = cl ? p.slice(0, -1) : p;
      o.push('0', 'POLYLINE', '8', '0', '66', '1', '10', '0', '20', '0', '30', '0', '70', cl ? '1' : '0');
      for (const [x, y] of pts) o.push('0', 'VERTEX', '8', '0', '10', f(x, 6), '20', f(y, 6), '30', '0');
      o.push('0', 'SEQEND', '8', '0');
    }
    o.push('0', 'ENDSEC', '0', 'EOF');
    return o.join('\r\n') + '\r\n';
  }
  function toSVG(polys, margin = 1) {
    const b = bounds(polys) || [0, 0, 1, 1], x0 = b[0] - margin, y1 = b[3] + margin, w = b[2] - b[0] + 2 * margin, h = b[3] - b[1] + 2 * margin;
    const d = polys.map(p => 'M' + p.map(([x, y], i) => (i && closed(p) && i === p.length - 1 ? 'Z' : `${i ? 'L' : ''}${f(x - x0)} ${f(y1 - y)}`)).join(' ')).join(' ');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${f(w)}mm" height="${f(h)}mm" viewBox="0 0 ${f(w)} ${f(h)}">\n<path d="${d}" fill="none" stroke="#000" stroke-width="1" vector-effect="non-scaling-stroke"/>\n</svg>\n`;
  }
  function toEPS(polys, margin = 1) {
    const b = bounds(polys) || [0, 0, 1, 1], k = 72 / 25.4, x0 = b[0] - margin, y0 = b[1] - margin, w = (b[2] - b[0] + 2 * margin) * k, h = (b[3] - b[1] + 2 * margin) * k;
    const L = ['%!PS-Adobe-3.0 EPSF-3.0', `%%BoundingBox: 0 0 ${Math.ceil(w)} ${Math.ceil(h)}`, `%%HiResBoundingBox: 0 0 ${f(w)} ${f(h)}`, '%%Creator: TauConvert web (RomDuch)', '%%EndComments',
      '0 setlinewidth 1 setlinejoin 1 setlinecap'];
    for (const p of polys) { L.push('newpath ' + p.map(([x, y], i) => (i && closed(p) && i === p.length - 1 ? 'closepath' : `${f((x - x0) * k)} ${f((y - y0) * k)} ${i ? 'lineto' : 'moveto'}`)).join(' ') + ' stroke'); }
    L.push('showpage', '%%EOF'); return L.join('\n') + '\n';
  }
  function toPDF(polys, margin = 1) {
    const b = bounds(polys) || [0, 0, 1, 1], k = 72 / 25.4, x0 = b[0] - margin, y0 = b[1] - margin, w = (b[2] - b[0] + 2 * margin) * k, h = (b[3] - b[1] + 2 * margin) * k;
    const s = ['0 w 1 j 1 J 0 G'];
    for (const p of polys) s.push(p.map(([x, y], i) => (i && closed(p) && i === p.length - 1 ? 'h' : `${f((x - x0) * k)} ${f((y - y0) * k)} ${i ? 'l' : 'm'}`)).join(' ') + ' S');
    const content = s.join('\n');
    const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(w)} ${f(h)}] /Contents 4 0 R /Resources << >> >>`,
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`, '<< /Producer (TauConvert web - RomDuch) >>'];
    let out = '%PDF-1.4\n'; const off = [];
    objs.forEach((o, i) => { off.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const x = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + off.map(v => String(v).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${x}\n%%EOF\n`;
    return out;
  }
  /* PNG à la résolution demandée (px/mm), fond blanc, traits noirs ; densité inscrite (bloc pHYs) pour garder la cote */
  function crc32(buf) { let c, crc = 0xFFFFFFFF; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xFF; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xFFFFFFFF) >>> 0; }
  async function toPNG(polys, { pxmm = 20, margin = 1, fill = false, line = 1 } = {}) {
    const b = bounds(polys) || [0, 0, 1, 1], w = Math.ceil((b[2] - b[0] + 2 * margin) * pxmm), h = Math.ceil((b[3] - b[1] + 2 * margin) * pxmm);
    if (w * h > 120e6) throw new Error(tr('Image trop grande ({w} × {h} px) : baisse la résolution.', { w, h }));
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const x = cv.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
    x.beginPath();
    for (const p of polys) p.forEach(([a, c], i) => { const X = (a - b[0] + margin) * pxmm, Y = h - (c - b[1] + margin) * pxmm; i ? x.lineTo(X, Y) : x.moveTo(X, Y); });
    if (fill) { x.fillStyle = '#000'; x.fill('evenodd'); }
    x.strokeStyle = '#000'; x.lineWidth = line; x.lineJoin = 'round'; x.lineCap = 'round'; x.stroke();
    const blob = await new Promise(ok => cv.toBlob(ok, 'image/png'));
    const src = new Uint8Array(await blob.arrayBuffer()), ppm = Math.round(pxmm * 1000);
    const chunk = new Uint8Array(21), dv = new DataView(chunk.buffer);
    dv.setUint32(0, 9); chunk.set([112, 72, 89, 115], 4); dv.setUint32(8, ppm); dv.setUint32(12, ppm); chunk[16] = 1; dv.setUint32(17, crc32(chunk.subarray(4, 17)));
    const out = new Uint8Array(src.length + 21); out.set(src.subarray(0, 33)); out.set(chunk, 33); out.set(src.subarray(33), 54);   // après IHDR
    return new Blob([out], { type: 'image/png' });
  }
  window.Vecteurs = { read, readDXF, readSVG, readPDF, readEPS, join, bounds, closed, toDXF, toSVG, toEPS, toPDF, toPNG, circle };
})();
