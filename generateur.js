/* Générateur SimPL (Datron next) – opérations de base de NeoDrive, bibliothèque d'outils tools.json.
   Tout est calculé dans le navigateur ; rien n'est envoyé. Programme à valider en simulation avant usinage. */
(function () {
  'use strict';
  const root = document.getElementById('gen');
  if (!root) return;

  /* ---------- utilitaires ---------- */
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = (v, d = 3) => { const x = Number(v); return Number.isFinite(x) ? String(+x.toFixed(d)) : '0'; };
  const q = s => String(s).replace(/"/g, "'");                      // chaînes SimPL
  const ident = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_]/g, '_');
  const el = (tag, attrs = {}, html = '') => { const e = document.createElement(tag); Object.assign(e, attrs); if (html) e.innerHTML = html; return e; };

  function parsePoints(txt) {
    return String(txt).split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
      const p = l.split(/[;\t ]+/).map(v => Number(v.replace(',', '.')));
      return p.length >= 2 && p.every(Number.isFinite) ? [p[0], p[1]] : null;
    }).filter(Boolean);
  }

  /* ---------- bibliothèque d'outils ---------- */
  let TOOLS = [];
  const toolById = id => TOOLS.find(t => t.id === id);

  /* ---------- définition des opérations ---------- */
  const STROKE = 'strokeRapidZ=4 strokeCuttingZ=1';
  const P = (k, label, type, def, opts, when) => ({ k, label, type, def, opts, when });
  const src = (...s) => o => s.includes(o.source);            // champ visible selon la source du tracé
  const ST = () => (window.Stockage && window.Stockage.actif()) ? window.Stockage : null;
  const PTS = P('points', 'Positions X;Y (une par ligne)', 'points', '0;0');

  const OPS = {
    thread: {
      label: 'Taraudage', tool: 'filetage', prefix: 'Taraudage',
      fields: [PTS, P('thread', 'Filetage', 'select', 'M5', ['M3', 'M4', 'M5', 'M6', 'M8']), P('depth', 'Profondeur (mm)', 'number', 6),
        P('dir', 'Sens', 'select', 'RightHandThread', ['RightHandThread', 'LeftHandThread']), P('finishing', 'Finition (mm)', 'number', 0.1)],
      body: o => parsePoints(o.points).flatMap(([x, y]) => [
        `SafeRapid X=${num(x)} Y=${num(y)} Z=5`,
        `Thread (Metric threadName="${q(o.thread)}" depth=${num(o.depth)} ${STROKE} Inside ${o.dir} ConventionalMilling finishing=${num(o.finishing)})`])
    },
    drill: {
      label: 'Perçage', tool: 'foret', prefix: 'Percage',
      fields: [PTS, P('depth', 'Profondeur (mm)', 'number', 5)],
      body: o => parsePoints(o.points).flatMap(([x, y]) => [
        `SafeRapid X=${num(x)} Y=${num(y)} Z=5`, `Drill (depth=${num(o.depth)} ${STROKE})`])
    },
    drillmill: {
      label: 'Perçage-fraisage', tool: 'fraise', prefix: 'PercageFraisage',
      fields: [PTS, P('diameter', 'Diamètre (mm)', 'number', 6), P('depth', 'Profondeur (mm)', 'number', 5), P('infeedZ', 'Passe Z (mm)', 'number', 0.5),
        P('finishingXY', 'Finition XY (mm)', 'number', 0.1), P('finishingZ', 'Finition Z (mm)', 'number', 0), P('infeedFinishingZ', 'Passe Z finition (mm)', 'number', 0.5)],
      body: o => parsePoints(o.points).flatMap(([x, y]) => [
        `SafeRapid X=${num(x)} Y=${num(y)} Z=5`,
        `DrillMilling (diameter=${num(o.diameter)} depth=${num(o.depth)} infeedZ=${num(o.infeedZ)} ${STROKE} finishingXY=${num(o.finishingXY)} finishingZ=${num(o.finishingZ)} infeedFinishingZ=${num(o.infeedFinishingZ)})`]),
      check: (o, t) => t && t.diameter >= o.diameter ? `Perçage-fraisage : l'outil Ø${t.diameter} doit être plus petit que le trou Ø${o.diameter}.` : ''
    },
    rectface: {
      label: 'Surfaçage rectangle', tool: 'surfacage', prefix: 'Surfacage_Rectangle',
      fields: [P('cx', 'Centre X', 'number', 0), P('cy', 'Centre Y', 'number', 0), P('widthX', 'Largeur X (mm)', 'number', 100), P('widthY', 'Largeur Y (mm)', 'number', 60),
        P('depth', 'Profondeur (mm)', 'number', 0.2), P('infeedZ', 'Passe Z (mm)', 'number', 0.1), P('finishingZ', 'Finition Z (mm)', 'number', 0),
        P('stepover', 'Recouvrement (%)', 'number', 45), P('angle', 'Angle (°)', 'number', 0)],
      body: o => [`SafeRapid X=${num(o.cx)} Y=${num(o.cy)} Z=5`,
        `RectangleFace (widthX=${num(o.widthX)} widthY=${num(o.widthY)} BothWays depth=${num(o.depth)} infeedZ=${num(o.infeedZ)} ${STROKE} finishingZ=${num(o.finishingZ)} percentageStepover=${num(o.stepover)} angle=${num(o.angle, 1)})`]
    },
    circleface: {
      label: 'Surfaçage cercle', tool: 'surfacage', prefix: 'Surfacage_Cercle',
      fields: [P('cx', 'Centre X', 'number', 0), P('cy', 'Centre Y', 'number', 0), P('diameter', 'Diamètre (mm)', 'number', 40),
        P('depth', 'Profondeur (mm)', 'number', 0.2), P('infeedZ', 'Passe Z (mm)', 'number', 0.1), P('finishingZ', 'Finition Z (mm)', 'number', 0), P('stepover', 'Recouvrement (%)', 'number', 45)],
      body: o => [`SafeRapid X=${num(o.cx)} Y=${num(o.cy)} Z=5`,
        `CircleFace (diameter=${num(o.diameter)} depth=${num(o.depth)} infeedZ=${num(o.infeedZ)} ${STROKE} finishingZ=${num(o.finishingZ)} percentageStepover=${num(o.stepover)})`]
    },
    circle: {
      label: 'Contour cercle', tool: 'fraise', prefix: 'Contour_Cercle',
      fields: [PTS, P('diameter', 'Diamètre (mm)', 'number', 20), P('side', 'Côté', 'select', 'Outside', ['Outside', 'Inside']), P('depth', 'Profondeur (mm)', 'number', 3),
        P('infeedZ', 'Passe Z (mm)', 'number', 0.5), P('finishingXY', 'Finition XY (mm)', 'number', 0.1), P('finishingZ', 'Finition Z (mm)', 'number', 0), P('infeedFinishingZ', 'Passe Z finition (mm)', 'number', 0.5)],
      body: o => parsePoints(o.points).flatMap(([x, y]) => [`SafeRapid X=${num(x)} Y=${num(y)} Z=5`,
        `CircleFromMid (diameter=${num(o.diameter)} ${o.side} depth=${num(o.depth)} infeedZ=${num(o.infeedZ)} ${STROKE} finishingXY=${num(o.finishingXY)} finishingZ=${num(o.finishingZ)} infeedFinishingZ=${num(o.infeedFinishingZ)})`])
    },
    rect: {
      label: 'Découpe rectangle', tool: 'fraise', prefix: 'Decoupe_Rectangle',
      fields: [P('cx', 'Centre X', 'number', 0), P('cy', 'Centre Y', 'number', 0), P('widthX', 'Largeur X (mm)', 'number', 40), P('widthY', 'Largeur Y (mm)', 'number', 30),
        P('cornerRadius', 'Rayon des coins (mm)', 'number', 2), P('side', 'Côté', 'select', 'Outside', ['Outside', 'Inside']), P('depth', 'Profondeur (mm)', 'number', 5),
        P('infeedZ', 'Passe Z (mm)', 'number', 0.5), P('finishingXY', 'Finition XY (mm)', 'number', 0.2), P('infeedFinishingZ', 'Passe Z finition (mm)', 'number', 0.5),
        P('nx', 'Répétitions en X', 'number', 1), P('px', 'Pas X (mm)', 'number', 45), P('ny', 'Répétitions en Y', 'number', 1), P('py', 'Pas Y (mm)', 'number', 35)],
      body: o => {
        const out = [];
        for (let j = 0; j < Math.max(1, +o.ny); j++) for (let i = 0; i < Math.max(1, +o.nx); i++) {
          out.push(`SafeRapid X=${num(+o.cx + i * o.px)} Y=${num(+o.cy + j * o.py)} Z=5`,
            `RectFromMid (widthX=${num(o.widthX)} widthY=${num(o.widthY)} cornerRadius=${num(o.cornerRadius)} ${o.side} diagonalInfeed=false depth=${num(o.depth)} infeedZ=${num(o.infeedZ)} ${STROKE} finishingXY=${num(o.finishingXY)} infeedFinishingZ=${num(o.infeedFinishingZ)})`);
        }
        return out;
      }
    },
    pocketrect: {
      label: 'Poche rectangle', tool: 'fraise', prefix: 'Poche_Rectangle',
      fields: [P('cx', 'Centre X', 'number', 0), P('cy', 'Centre Y', 'number', 0), P('widthX', 'Largeur X (mm)', 'number', 30), P('widthY', 'Largeur Y (mm)', 'number', 20),
        P('cornerRadius', 'Rayon des coins (mm)', 'number', 3), P('depth', 'Profondeur (mm)', 'number', 2), P('infeedZ', 'Passe Z (mm)', 'number', 0.5),
        P('stepover', 'Recouvrement (% du Ø outil)', 'number', 40), P('finishingXY', 'Finition XY (mm)', 'number', 0.1)],
      seq: (o, t, name) => pocketSequence(name, o, t, 'rect'),
      check: (o, t) => t && t.diameter >= Math.min(o.widthX, o.widthY) ? `Poche rectangle : l'outil Ø${t.diameter} est trop gros pour la poche.`
        : (t && +o.cornerRadius < t.diameter / 2 ? `Poche rectangle : rayon de coin (${o.cornerRadius}) < rayon outil (${t.diameter / 2}) : les coins seront arrondis au rayon de l'outil.` : '')
    },
    pocketcircle: {
      label: 'Poche cercle', tool: 'fraise', prefix: 'Poche_Cercle',
      fields: [P('cx', 'Centre X', 'number', 0), P('cy', 'Centre Y', 'number', 0), P('diameter', 'Diamètre (mm)', 'number', 20),
        P('depth', 'Profondeur (mm)', 'number', 2), P('infeedZ', 'Passe Z (mm)', 'number', 0.5),
        P('stepover', 'Recouvrement (% du Ø outil)', 'number', 40), P('finishingXY', 'Finition XY (mm)', 'number', 0.1)],
      seq: (o, t, name) => pocketSequence(name, o, t, 'circle'),
      check: (o, t) => t && t.diameter >= o.diameter ? `Poche cercle : l'outil Ø${t.diameter} est trop gros pour la poche Ø${o.diameter}.` : ''
    },
    probe: {
      label: 'Palpage rectangle', tool: null, prefix: 'Palpage',
      fields: [P('dimX', 'Dimension X (mm)', 'number', 100), P('dimY', 'Dimension Y (mm)', 'number', 60), P('zOff', 'Décalage Z des palpages X/Y (mm)', 'number', -2),
        P('ox', 'Décalage origine X', 'number', 0), P('oy', 'Décalage origine Y', 'number', 0), P('oz', 'Décalage origine Z', 'number', 0),
        P('skipZ', 'Palper aussi Z', 'select', 'oui', ['oui', 'non'])],
      name: o => `Palpage_X${ident(num(o.dimX, 1))}_Y${ident(num(o.dimY, 1))}`,
      body: o => ['SafeRapid X=0.000 Y=0.000 Z=50', 'RectangleMeasure (', ...[
        `dimensionX=${num(o.dimX)}`, `dimensionY=${num(o.dimY)}`, 'Center', 'Outside',
        'xMeasureYShift=0', `xMeasureZOffset=${num(o.zOff)}`, 'yMeasureXShift=0', `yMeasureZOffset=${num(o.zOff)}`,
        'zMeasureXShift=0', 'zMeasureYShift=0', 'YPositive', `distanceForRotation=${num(Math.min(o.dimX, o.dimY) * 0.8, 1)}`, 'Wcs',
        `originXShift=${num(o.ox)}`, `originYShift=${num(o.oy)}`, `originZShift=${num(o.oz)}`,
        'skipZMeasureResult=false', 'forceSafeHeight=false', `skipZMeasure=${o.skipZ === 'non'}`].map(s => '     ' + s), '     )']
    },
    shift: {
      label: "Décalage d'origine (ShiftWcsInc)", inline: true,
      fields: [P('dx', 'X (mm)', 'number', 0), P('dy', 'Y (mm)', 'number', 0), P('dz', 'Z (mm)', 'number', 0.06)],
      main: o => { const a = [['X', o.dx], ['Y', o.dy], ['Z', o.dz]].filter(([, v]) => +v !== 0).map(([k, v]) => `${k}=${num(v)}`);
        return a.length ? [`ShiftWcsInc ${a.join(' ')}`] : []; }
    },
    dialog: {
      label: 'Message opérateur', dialog: true, prefix: 'Message',
      fields: [P('message', 'Message', 'text', "Retourner la pièce, palper l'origine, puis continuer ?"),
        P('stop', 'Si « Non »', 'select', 'arrêter la suite', ['arrêter la suite', 'continuer quand même'])]
    },
    trace: {
      label: 'Tracé (DXF, rectangle, cercle, segment)', tool: 'gravure', prefix: 'Trace', trace: true,
      fields: [P('source', 'Source du tracé', 'select', 'DXF', ['DXF', 'Rectangle', 'Cercle', 'Segment']),
        P('lib', 'DXF enregistré', 'dxflib', '', null, src('DXF')), P('file', 'Importer un DXF', 'file', '', null, src('DXF')),
        P('scale', 'Échelle', 'number', 1, null, src('DXF')), P('center', 'Centrer le dessin', 'select', 'oui', ['oui', 'non'], src('DXF')),
        P('offX', 'Décalage X (mm)', 'number', 0, null, src('DXF')), P('offY', 'Décalage Y (mm)', 'number', 0, null, src('DXF')),
        P('cx', 'Centre X', 'number', 0, null, src('Rectangle', 'Cercle')), P('cy', 'Centre Y', 'number', 0, null, src('Rectangle', 'Cercle')),
        P('widthX', 'Largeur X (mm)', 'number', 40, null, src('Rectangle')), P('widthY', 'Largeur Y (mm)', 'number', 20, null, src('Rectangle')),
        P('cornerRadius', 'Rayon des coins (mm)', 'number', 0, null, src('Rectangle')),
        P('diameter', 'Diamètre (mm)', 'number', 20, null, src('Cercle')),
        P('x1', 'X départ', 'number', -20, null, src('Segment')), P('y1', 'Y départ', 'number', 0, null, src('Segment')),
        P('x2', 'X arrivée', 'number', 20, null, src('Segment')), P('y2', 'Y arrivée', 'number', 0, null, src('Segment')),
        P('depth', 'Profondeur (mm)', 'number', 0.2), P('infeedZ', 'Passe Z (mm)', 'number', 0.1)]
    }
  };

  /* ---------- lecture DXF (LINE, ARC, CIRCLE, LWPOLYLINE, POLYLINE/VERTEX) ---------- */
  function parseDXF(text) {
    const L = text.replace(/\r/g, '').split('\n');
    const pairs = [];
    for (let i = 0; i + 1 < L.length; i += 2) pairs.push([parseInt(L[i], 10), L[i + 1].trim()]);
    let i = pairs.findIndex(([c, v], k) => c === 2 && v === 'ENTITIES' && pairs[k - 1] && pairs[k - 1][1] === 'SECTION');
    if (i < 0) i = 0;
    const ents = []; let cur = null, poly = null;
    const flush = () => { if (cur) ents.push(cur); cur = null; };
    for (i++; i < pairs.length; i++) {
      const [c, v] = pairs[i];
      if (c === 0) {
        if (v === 'ENDSEC') { flush(); break; }
        if (v === 'VERTEX' && poly) { flush(); cur = { t: 'VERTEX', owner: poly }; continue; }
        if (v === 'SEQEND') { flush(); if (poly) ents.push(poly); poly = null; continue; }
        flush();
        if (v === 'POLYLINE') { poly = { t: 'POLY', v: [], closed: false }; continue; }
        cur = { t: v, v: [] };
        continue;
      }
      if (!cur && poly && c === 70) { poly.closed = (+v & 1) === 1; continue; }
      if (!cur) continue;
      const n = parseFloat(v);
      if (cur.t === 'VERTEX') {
        if (c === 10) cur.owner.v.push({ x: n, y: 0, b: 0 });
        else if (c === 20) cur.owner.v[cur.owner.v.length - 1].y = n;
        else if (c === 42) cur.owner.v[cur.owner.v.length - 1].b = n;
      } else if (cur.t === 'LWPOLYLINE') {
        if (c === 10) cur.v.push({ x: n, y: 0, b: 0 });
        else if (c === 20) cur.v[cur.v.length - 1].y = n;
        else if (c === 42) cur.v[cur.v.length - 1].b = n;
        else if (c === 70) cur.closed = (+v & 1) === 1;
      } else cur[c] = n;
    }
    // conversion en tracés { x0, y0, segs:[{x,y} | {x,y,cx,cy,ccw}] }
    const paths = [];
    const polyPath = (vs, closed) => {
      if (vs.length < 2) return;
      const segs = [], n = vs.length;
      for (let k = 0; k < (closed ? n : n - 1); k++) {
        const a = vs[k], b = vs[(k + 1) % n];
        if (Math.abs(a.b) > 1e-9) {
          const f = (1 - a.b * a.b) / (4 * a.b), dx = b.x - a.x, dy = b.y - a.y;
          segs.push({ x: b.x, y: b.y, cx: (a.x + b.x) / 2 - dy * f, cy: (a.y + b.y) / 2 + dx * f, ccw: a.b > 0 });
        } else segs.push({ x: b.x, y: b.y });
      }
      paths.push({ x0: vs[0].x, y0: vs[0].y, segs });
    };
    for (const e of ents) {
      if (e.t === 'LINE') paths.push({ x0: e[10], y0: e[20], segs: [{ x: e[11], y: e[21] }] });
      else if (e.t === 'ARC') {
        const r = e[40], a0 = e[50] * Math.PI / 180, a1 = e[51] * Math.PI / 180;
        paths.push({ x0: e[10] + r * Math.cos(a0), y0: e[20] + r * Math.sin(a0),
          segs: [{ x: e[10] + r * Math.cos(a1), y: e[20] + r * Math.sin(a1), cx: e[10], cy: e[20], ccw: true }] });
      } else if (e.t === 'CIRCLE') {
        const r = e[40];
        paths.push({ x0: e[10] + r, y0: e[20], segs: [
          { x: e[10] - r, y: e[20], cx: e[10], cy: e[20], ccw: true }, { x: e[10] + r, y: e[20], cx: e[10], cy: e[20], ccw: true }] });
      } else if (e.t === 'LWPOLYLINE' || e.t === 'POLY') polyPath(e.v, e.closed);
    }
    return { paths, ignored: [...new Set(ents.map(e => e.t).filter(t => !['LINE', 'ARC', 'CIRCLE', 'LWPOLYLINE', 'POLY', 'VERTEX'].includes(t)))] };
  }

  const endOf = p => p.segs.length ? p.segs[p.segs.length - 1] : { x: p.x0, y: p.y0 };
  function reversePath(p) {
    const pts = [{ x: p.x0, y: p.y0 }, ...p.segs];
    const segs = [];
    for (let k = pts.length - 1; k > 0; k--) {
      const s = pts[k], prev = pts[k - 1];
      segs.push(s.cx !== undefined ? { x: prev.x, y: prev.y, cx: s.cx, cy: s.cy, ccw: !s.ccw } : { x: prev.x, y: prev.y });
    }
    const last = pts[pts.length - 1];
    return { x0: last.x, y0: last.y, segs };
  }
  function chain(paths, tol = 1e-3) {         // enchaîne les tracés bout à bout pour limiter les remontées
    const left = paths.slice(), out = [];
    while (left.length) {
      let p = left.shift(), grew = true;
      while (grew) {
        grew = false; const e = endOf(p);
        for (let k = 0; k < left.length; k++) {
          const c = left[k], ce = endOf(c);
          if (Math.hypot(c.x0 - e.x, c.y0 - e.y) < tol) { p = { x0: p.x0, y0: p.y0, segs: p.segs.concat(c.segs) }; left.splice(k, 1); grew = true; break; }
          if (Math.hypot(ce.x - e.x, ce.y - e.y) < tol) { const r = reversePath(c); p = { x0: p.x0, y0: p.y0, segs: p.segs.concat(r.segs) }; left.splice(k, 1); grew = true; break; }
        }
      }
      out.push(p);
    }
    return out;
  }
  function transform(paths, o) {
    const s = +o.scale || 1;
    let xs = [], ys = [];
    paths.forEach(p => { xs.push(p.x0); ys.push(p.y0); p.segs.forEach(g => { xs.push(g.x); ys.push(g.y); }); });
    const mx = o.center === 'oui' ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0, my = o.center === 'oui' ? (Math.min(...ys) + Math.max(...ys)) / 2 : 0;
    const T = (x, y) => [(x - mx) * s + (+o.offX || 0), (y - my) * s + (+o.offY || 0)];
    return paths.map(p => {
      const [x0, y0] = T(p.x0, p.y0);
      return { x0, y0, segs: p.segs.map(g => { const [x, y] = T(g.x, g.y); if (g.cx === undefined) return { x, y };
        const [cx, cy] = T(g.cx, g.cy); return { x, y, cx, cy, ccw: g.ccw }; }) };
    });
  }
  function tracePaths(o) {                    // tracé suivi par l'outil (sans compensation de rayon)
    switch (o.source) {
      case 'Rectangle': return [roundRect(+o.cx || 0, +o.cy || 0, Math.abs(o.widthX) / 2, Math.abs(o.widthY) / 2, +o.cornerRadius || 0)];
      case 'Cercle': return +o.diameter > 0 ? [circlePath(+o.cx || 0, +o.cy || 0, o.diameter / 2)] : [];
      case 'Segment': return [{ x0: +o.x1 || 0, y0: +o.y1 || 0, segs: [{ x: +o.x2 || 0, y: +o.y2 || 0 }] }];
      default: return transform(chain(parseDXF(o.dxfText || '').paths), o);
    }
  }
  function traceSequence(name, o) {
    const paths = tracePaths(o);
    const depth = Math.abs(+o.depth || 0.1), inf = Math.max(0.01, Math.abs(+o.infeedZ || depth));
    const levels = []; for (let z = inf; z < depth - 1e-6; z += inf) levels.push(z); levels.push(depth);
    const out = [`$$$ ${name}`, 'Spindle On'];
    paths.forEach((p, pi) => {
      if (pi === 0) out.push(`PrePositioning X=${num(p.x0, 4)} Y=${num(p.y0, 4)} Z=5`, 'Rapid Z=1');
      else out.push('Rapid Z=1', `Rapid X=${num(p.x0, 4)} Y=${num(p.y0, 4)}`);
      levels.forEach((z, li) => {
        if (li > 0) out.push('Rapid Z=1', `Rapid X=${num(p.x0, 4)} Y=${num(p.y0, 4)}`);
        out.push('Feed Plunge', `Line Z=${num(-z, 4)}`, li === levels.length - 1 ? 'Feed Finishing' : 'Feed Roughing');
        let cx = p.x0, cy = p.y0;
        p.segs.forEach(g => {
          if (g.cx === undefined) out.push(`Line X=${num(g.x, 4)} Y=${num(g.y, 4)}`);
          else out.push(`Arc ${g.ccw ? 'CCW' : 'CW'} X=${num(g.x, 4)} Y=${num(g.y, 4)} dX=${num(g.cx - cx, 4)} dY=${num(g.cy - cy, 4)}`);
          cx = g.x; cy = g.y;
        });
      });
    });
    out.push('Rapid Z=1', 'MoveToSafetyPosition');
    return { lines: out, count: paths.length };
  }

  /* ---------- poches : trajectoire explicite (boucles concentriques + contour de finition) ---------- */
  function zLevels(o) {
    const depth = Math.abs(+o.depth || 0.1), inf = Math.max(0.01, Math.abs(+o.infeedZ || depth));
    const lv = []; for (let z = inf; z < depth - 1e-6; z += inf) lv.push(z); lv.push(depth); return lv;
  }
  function emitSegs(out, p) {
    let cx = p.x0, cy = p.y0;
    p.segs.forEach(g => {
      if (g.cx === undefined) out.push(`Line X=${num(g.x, 4)} Y=${num(g.y, 4)}`);
      else out.push(`Arc ${g.ccw ? 'CCW' : 'CW'} X=${num(g.x, 4)} Y=${num(g.y, 4)} dX=${num(g.cx - cx, 4)} dY=${num(g.cy - cy, 4)}`);
      cx = g.x; cy = g.y;
    });
  }
  function roundRect(cx, cy, a, b, c) {         // rectangle de demi-côtés a,b, rayon c, anti-horaire, départ milieu bas
    c = Math.max(0, Math.min(c, a, b));
    const s = [], L = (x, y) => s.push({ x, y }), A = (x, y, ccx, ccy) => c > 1e-6 && s.push({ x, y, cx: ccx, cy: ccy, ccw: true });
    L(cx + a - c, cy - b); A(cx + a, cy - b + c, cx + a - c, cy - b + c);
    L(cx + a, cy + b - c); A(cx + a - c, cy + b, cx + a - c, cy + b - c);
    L(cx - a + c, cy + b); A(cx - a, cy + b - c, cx - a + c, cy + b - c);
    L(cx - a, cy - b + c); A(cx - a + c, cy - b, cx - a + c, cy - b + c);
    L(cx, cy - b);
    return { x0: cx, y0: cy - b, segs: s.filter((g, k, arr) => k === 0 ? Math.hypot(g.x - cx, g.y - (cy - b)) > 1e-6 || g.cx !== undefined
      : Math.hypot(g.x - arr[k - 1].x, g.y - arr[k - 1].y) > 1e-6 || g.cx !== undefined) };
  }
  const circlePath = (cx, cy, R) => ({ x0: cx + R, y0: cy, segs: [
    { x: cx - R, y: cy, cx, cy, ccw: true }, { x: cx + R, y: cy, cx, cy, ccw: true }] });

  function pocketSequence(name, o, t, shape) {
    const r = t.diameter / 2, step = Math.max(0.05, t.diameter * (+o.stepover || 40) / 100), fin = Math.max(0, +o.finishingXY || 0);
    const cx = +o.cx || 0, cy = +o.cy || 0;
    let rough = [], finish, start;
    if (shape === 'rect') {
      const W = +o.widthX / 2, H = +o.widthY / 2, Rc = +o.cornerRadius || 0;
      finish = roundRect(cx, cy, W - r, H - r, Rc - r);
      for (let d = r + fin; W - d > 1e-6 && H - d > 1e-6; d += step) rough.push(roundRect(cx, cy, W - d, H - d, Rc - d));
      rough.reverse();                                             // du centre vers l'extérieur
      const e = Math.max(0, Math.abs(W - H));                      // ligne centrale pour le reliquat
      const center = W >= H ? { x0: cx - e, y0: cy, segs: [{ x: cx + e, y: cy }] } : { x0: cx, y0: cy - e, segs: [{ x: cx, y: cy + e }] };
      rough.unshift(center);
    } else {
      const Rf = +o.diameter / 2 - r;
      finish = circlePath(cx, cy, Rf);
      for (let R = Rf - fin; R > 1e-6; R -= step) rough.push(circlePath(cx, cy, R));
      rough.reverse();
      rough.unshift({ x0: cx, y0: cy, segs: [] });
    }
    start = rough[0];
    const out = [`$$$ ${name}`, 'Spindle On', `PrePositioning X=${num(start.x0, 4)} Y=${num(start.y0, 4)} Z=5`, 'Rapid Z=1'];
    zLevels(o).forEach((z, li) => {
      if (li > 0) out.push('Rapid Z=1', `Rapid X=${num(start.x0, 4)} Y=${num(start.y0, 4)}`);
      out.push('Feed Plunge', `Line Z=${num(-z, 4)}`, 'Feed Roughing');
      rough.forEach((p, k) => { if (k > 0) out.push(`Line X=${num(p.x0, 4)} Y=${num(p.y0, 4)}`); emitSegs(out, p); });
    });
    out.push('Feed Finishing', `Line X=${num(finish.x0, 4)} Y=${num(finish.y0, 4)}`);   // contour de finition à pleine profondeur
    emitSegs(out, finish);
    out.push('Rapid Z=1', 'MoveToSafetyPosition');
    return out;
  }

  /* ---------- génération du programme ---------- */
  function toolDescription(t) {
    const f = [['Name', `"${q(t.name)}"`], ['Category', '"Unspecified"'], ['ArticleNr', `"${q(t.articleNr)}"`], ['Vendor', `"${q(t.vendor || '')}"`],
      ['Diameter', t.diameter], ['TipAngle', t.tipAngle ?? 0], ['TipDiameter', t.tipDiameter ?? t.diameter], ['FluteLength', t.fluteLength], ['NumberOfFlutes', t.flutes]]
      .filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => `"${k}":${v}`);
    return `@ ToolDescription : ${f.join(', ')} @`;
  }
  function toolBlock(t) {
    const fd = t.feeds || {};
    const feeds = ['finishing', 'approach', 'plunge', 'ramp', 'roughing'].filter(k => fd[k] !== undefined).map(k => `${k}=${fd[k]}`).join(' ');
    return [`Tool type="${q(t.articleNr)}"  skipRestoring    #${t.name}`,
      t.rpm ? `Rpm = ${t.rpm}` : '# Rpm à renseigner (rotation non définie pour cet outil)', 'Spindle On',
      feeds ? `SetFeedTechnology (${feeds})` : '# SetFeedTechnology à renseigner (avances non définies pour cet outil)'];
  }

  function generate(state) {
    const h = state.head, warn = [], used = new Map(), programs = [], mainLines = [], seqs = [];
    const names = {}; const uniq = base => { names[base] = (names[base] || 0) + 1; return names[base] > 1 ? `${base}_${names[base]}` : base; };
    let openIfs = 0;
    state.ops.forEach(o => {
      const def = OPS[o.type];
      if (def.inline) { mainLines.push(...def.main(o)); return; }
      if (def.dialog) {
        const name = uniq(`${def.prefix}_${state.ops.indexOf(o) + 1}`);
        programs.push(`program ${name} returns DialogResult`, '    SpraySystem Off', '    Spindle Off', '    MoveToParkPosition',
          `    result = Dialog message="${q(o.message)}" Yes=true No=true`, '    return result', 'endprogram', '');
        mainLines.push(`result = ${name}`);
        if (o.stop === 'arrêter la suite') { mainLines.push('if result == DialogResult.Yes'); openIfs++; }
        return;
      }
      const t = def.tool ? toolById(o.tool) : null;
      if (def.tool && !t) { warn.push(`${def.label} : aucun outil choisi.`); return; }
      if (def.check) { const w = def.check(o, t); if (w) warn.push(w); }
      if (t && !used.has(t.id) && (!t.rpm || !Object.values(t.feeds || {}).some(v => v !== undefined && v !== null && v !== '')))
        warn.push(`Outil « ${t.name} » : rotation ou avances non renseignées, à compléter dans l'éditeur d'outils.`);
      if (t) used.set(t.id, t);
      const name = uniq(def.name ? def.name(o) : def.prefix);
      let body;
      if (def.trace) {
        if (o.source === 'DXF' && !o.dxfText) { warn.push(`${def.label} : aucun fichier DXF chargé.`); return; }
        const seqName = ident(`${name}_${t.id}`).toUpperCase();
        const seq = traceSequence(seqName, o);
        if (!seq.count) { warn.push(`${def.label} : aucun tracé exploitable${o.source === 'DXF' ? ` dans « ${o.dxfName} »` : ''}.`); return; }
        seqs.push({ name: seqName, lines: seq.lines });
        body = [seqName];
      } else if (def.seq) {
        const seqName = ident(`${name}_${t.id}`).toUpperCase();
        seqs.push({ name: seqName, lines: def.seq(o, t, seqName) });
        body = [seqName];
      } else body = def.body(o);
      if (!body.length) { warn.push(`${def.label} : aucune position valide.`); return; }
      if (t && (+o.depth || 0) > (t.fluteLength || Infinity)) warn.push(`${def.label} : profondeur ${o.depth} mm supérieure à la longueur de coupe de « ${t.name} ».`);
      programs.push(`# ${def.label}${t ? ' – outil ' + t.name : ''}`, `program ${name}`, `    BeginBlock name="${name}"`, '    SafeZHeightForWorkpiece=0.2',
        ...(t ? ['    SpraySystem On', ...toolBlock(t).map(s => '    ' + s)] : []), ...body.map(s => '    ' + s), '    EndBlock', 'endprogram', '');
      mainLines.push(name);
    });
    for (; openIfs > 0; openIfs--) mainLines.push('endif');

    const bx = +h.bx, by = +h.by, bz = +h.bz;
    const [x0, x1, y0, y1] = h.origin === 'coin' ? [0, bx, 0, by] : [-bx / 2, bx / 2, -by / 2, by / 2];
    const f5 = v => (v >= 0 ? '+' : '') + v.toFixed(5);
    const now = new Date(), stamp = now.toLocaleDateString('fr-FR') + ' ' + now.toLocaleTimeString('fr-FR');
    const out = [
      `# File generated by NeoDrive web - ${stamp}`,
      `module ${ident(h.module) || 'CamGeneratedModule'}`,
      '@ MeasuringSystem = "Metric" @',
      `@ Comment = "${q(h.comment)}" @`,
      `@ EmbeddedSequences = ${seqs.length ? 'true' : 'false'} @`,
      `@ Author = "${q(h.author)}" @`,
      ...[...used.values()].map(toolDescription),
      '# Workpiece dimensions',
      `#   min:       X: ${f5(x0)}; Y: ${f5(y0)}; Z: ${f5(-bz)}`,
      `#   max:       X: ${f5(x1)}; Y: ${f5(y1)}; Z: +0.00000`,
      `@ WorkpieceGeometry : "MinEdge":{"X":${f5(x0)},"Y":${f5(y0)},"Z":${f5(-bz)}}, "MaxEdge":{"X":${f5(x1)},"Y":${f5(y1)},"Z":+0.00000} @`,
      '',
      ...seqs.map(s => `sequence ${s.name}`), ...(seqs.length ? [''] : []),
      'using Base',
      'import System, DialogUtilities, Pattern, Engrave, DateTimeModule',
      '',
      'export program Main',
      '    Absolute',
      ...mainLines.map(s => '    ' + s),
      '    SpraySystem Off',
      '    Spindle Off',
      '    MoveToParkPosition',
      'endprogram',
      '',
      ...programs,
      ...(seqs.length ? ['end', '', ...seqs.flatMap(s => [...s.lines, ''])] : [])
    ];
    return { code: out.join('\n'), warn };
  }

  /* ---------- état et interface ---------- */
  const state = {
    head: { module: 'CamGeneratedModule', author: 'NeoDrive web', comment: 'Merci de vérifier le programme avant usinage', bx: 100, by: 60, bz: 20, origin: 'centre' },
    ops: []
  };
  const newOp = type => {
    const def = OPS[type], o = { type };
    def.fields.forEach(f => { o[f.k] = f.def; });
    if (def.tool) { const t = TOOLS.find(x => x.type === def.tool) || TOOLS[0]; o.tool = t ? t.id : ''; }
    return o;
  };

  function fieldHTML(f, o, id) {
    if (f.when && !f.when(o)) return '';
    const val = o[f.k];
    if (f.type === 'select') return `<label>${esc(f.label)}<select data-k="${f.k}" id="${id}">${f.opts.map(v => `<option${v === val ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></label>`;
    if (f.type === 'points') return `<label class="wide">${esc(f.label)}<textarea data-k="${f.k}" id="${id}" spellcheck="false">${esc(val)}</textarea></label>`;
    if (f.type === 'file') return `<label class="wide">${esc(f.label)}${ST() ? ' <small>(enregistré dans vos DXF)</small>' : ''}<input type="file" data-k="${f.k}" id="${id}" accept=".dxf"></label>`;
    if (f.type === 'dxflib') {
      const lib = ST() ? ST().get('dxf', []) : [];
      if (!lib.length) return '';
      return `<label class="wide">${esc(f.label)}<select data-k="${f.k}" id="${id}"><option value="">— choisir —</option>${lib.map(d =>
        `<option value="${esc(d.nom)}"${d.nom === val ? ' selected' : ''}>${esc(d.nom)} (${Math.max(1, Math.round(d.texte.length / 1024))} ko)</option>`).join('')}</select></label>`;
    }
    if (f.type === 'text') return `<label class="wide">${esc(f.label)}<input type="text" data-k="${f.k}" id="${id}" value="${esc(val)}"></label>`;
    return `<label>${esc(f.label)}<input type="number" step="any" data-k="${f.k}" id="${id}" value="${esc(val)}"></label>`;
  }

  const headBox = el('div', { className: 'gbox' });
  const toolBox = el('div', { className: 'gbox' });
  const opsBox = el('div', { className: 'gen' });
  const addBox = el('div', { className: 'gbox' });
  const outBox = el('div', { className: 'gbox' });
  root.append(headBox, toolBox, opsBox, addBox, outBox);

  function renderHead() {
    const H = state.head;
    headBox.innerHTML = `<h3>En-tête du programme et brut</h3><div class="fields">
      <label>Module<input data-h="module" value="${esc(H.module)}"></label>
      <label>Auteur (Author)<input data-h="author" value="${esc(H.author)}"></label>
      <label class="wide">Commentaire (Comment)<input data-h="comment" value="${esc(H.comment)}"></label>
      <label>Brut X (mm)<input type="number" step="any" data-h="bx" value="${H.bx}"></label>
      <label>Brut Y (mm)<input type="number" step="any" data-h="by" value="${H.by}"></label>
      <label>Brut Z (mm)<input type="number" step="any" data-h="bz" value="${H.bz}"></label>
      <label>Origine<select data-h="origin"><option value="centre"${H.origin === 'centre' ? ' selected' : ''}>centre, dessus de pièce</option><option value="coin"${H.origin === 'coin' ? ' selected' : ''}>coin avant gauche, dessus</option></select></label>
    </div>`;
    headBox.querySelectorAll('[data-h]').forEach(i => i.addEventListener('input', () => { H[i.dataset.h] = i.value; }));
  }

  let toolSource = 'tools.json générique du site';
  function setTools(list, source) {
    TOOLS = list; toolSource = source;
    state.ops.forEach(o => { if (OPS[o.type].tool && !toolById(o.tool)) { const t = TOOLS.find(x => x.type === OPS[o.type].tool) || TOOLS[0]; o.tool = t ? t.id : ''; } });
  }
  function renderTools(msg) {
    toolBox.innerHTML = `<h3>Bibliothèque d'outils</h3>
      <p style="margin:0 0 8px;color:var(--mute)">${TOOLS.length ? `${TOOLS.length} outil(s)` : 'Bibliothèque vide'} – source : ${esc(toolSource)}${msg ? ' – ' + esc(msg) : ''}.</p>
      <div class="addbar"><a class="btnlink" href="outils.html">Éditer mes outils / catalogue Datron</a>
      <label><button type="button" id="gt-load">Charger un tools.json…</button><input type="file" id="gt-file" accept=".json,application/json" hidden></label></div>`;
    toolBox.querySelector('#gt-load').onclick = () => toolBox.querySelector('#gt-file').click();
    toolBox.querySelector('#gt-file').onchange = e => {
      const f = e.target.files[0]; if (!f) return;
      f.text().then(t => { const j = JSON.parse(t); if (!Array.isArray(j.tools)) throw new Error('clé « tools » absente');
        setTools(j.tools, f.name);
        const saved = ST() && ST().set('tools', j);
        renderTools(saved ? 'enregistré dans ce navigateur' : ''); renderOps(); })
        .catch(err => renderTools('erreur : ' + err.message));
    };
  }

  function saveDxf(nom, texte) {
    if (!ST()) return;
    const lib = ST().get('dxf', []).filter(d => d.nom !== nom);
    lib.unshift({ nom, date: new Date().toISOString(), texte });
    ST().set('dxf', lib.slice(0, 30));
  }

  function renderOps() {
    opsBox.innerHTML = state.ops.length ? '' : `<p class="gbox" style="margin:0;color:var(--mute)">Aucune opération : ajoutez-en ci-dessous${TOOLS.length ? '' : ", après avoir créé vos outils dans l'<a href=\"outils.html\">éditeur d'outils</a> (catalogue DATRON)"}.</p>`;
    state.ops.forEach((o, idx) => {
      const def = OPS[o.type], box = el('div', { className: 'gbox op' });
      const tools = def.tool ? `<label>Outil<select data-k="tool">${TOOLS.map(t => `<option value="${esc(t.id)}"${t.id === o.tool ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>` : '';
      const t = def.tool ? toolById(o.tool) : null;
      const resume = [t && t.name, def.trace && (o.source === 'DXF' ? o.dxfName : o.source)].filter(Boolean).join(' · ');
      box.innerHTML = `<div class="ophead"><h3>${idx + 1}. ${esc(def.label)}${o.collapsed && resume ? `<small> – ${esc(resume)}</small>` : ''}</h3>
        ${ST() ? '<button type="button" data-a="fav" title="Enregistrer comme opération favorite">☆ Favori</button>' : ''}
        <button type="button" data-a="toggle" aria-expanded="${!o.collapsed}" aria-controls="opf${idx}">${o.collapsed ? 'Afficher' : 'Masquer'}</button>
        <button type="button" data-a="up" aria-label="Monter">▲</button><button type="button" data-a="down" aria-label="Descendre">▼</button>
        <button type="button" data-a="del" aria-label="Supprimer">Supprimer</button></div>
        <div id="opf${idx}"${o.collapsed ? ' hidden' : ''}>
        <div class="fields">${tools}${def.fields.map((f, k) => fieldHTML(f, o, `op${idx}_${k}`)).join('')}</div>
        ${def.trace && o.source === 'DXF' && o.dxfName ? `<p style="margin:6px 0 0;color:var(--mute)">DXF chargé : ${esc(o.dxfName)}</p>` : ''}</div>`;
      box.querySelector('[data-a=toggle]').onclick = () => { o.collapsed = !o.collapsed; renderOps(); };
      const fav = box.querySelector('[data-a=fav]');
      if (fav) fav.onclick = () => {
        const nom = prompt("Nom de l'opération favorite :", resume ? `${def.label} – ${resume}` : def.label);
        if (!nom) return;
        const copie = JSON.parse(JSON.stringify(o)); delete copie.dxfText; delete copie.collapsed;
        const favs = ST().get('favoris', []).filter(x => x.nom !== nom);
        favs.push({ nom, op: copie }); ST().set('favoris', favs); renderAdd();
      };
      box.querySelectorAll('[data-k]').forEach(i => {
        const k = i.dataset.k;
        if (i.type === 'file') i.onchange = e => { const f = e.target.files[0]; if (!f) return;
          f.text().then(tx => { o.dxfText = tx; o.dxfName = f.name; o.lib = f.name; saveDxf(f.name, tx); renderOps(); }); };
        else if (k === 'lib') i.addEventListener('change', () => { const d = (ST() ? ST().get('dxf', []) : []).find(x => x.nom === i.value);
          o.lib = i.value; if (d) { o.dxfText = d.texte; o.dxfName = d.nom; } renderOps(); });
        else if (k === 'source') i.addEventListener('change', () => { o.source = i.value; renderOps(); });
        else i.addEventListener('input', () => { o[k] = i.value; });
      });
      box.querySelector('[data-a=up]').onclick = () => { if (idx > 0) { state.ops.splice(idx - 1, 0, state.ops.splice(idx, 1)[0]); renderOps(); } };
      box.querySelector('[data-a=down]').onclick = () => { if (idx < state.ops.length - 1) { state.ops.splice(idx + 1, 0, state.ops.splice(idx, 1)[0]); renderOps(); } };
      box.querySelector('[data-a=del]').onclick = () => { state.ops.splice(idx, 1); renderOps(); };
      opsBox.append(box);
    });
  }

  function addOp(o) { state.ops.push(o); renderOps(); opsBox.lastChild.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }

  function renderAdd() {
    const favs = ST() ? ST().get('favoris', []) : [];
    addBox.innerHTML = `<h3>Ajouter une opération</h3><div class="addbar">${Object.entries(OPS).map(([k, d]) => `<button type="button" data-add="${k}">+ ${esc(d.label)}</button>`).join('')}</div>
      ${ST() ? `<h3 style="margin-top:12px">Mes favoris</h3>${favs.length ? `<div class="addbar">${favs.map((f, i) =>
        `<span class="favchip"><button type="button" data-fav="${i}">★ ${esc(f.nom)}</button><button type="button" data-favdel="${i}" aria-label="Retirer ${esc(f.nom)} des favoris">✕</button></span>`).join('')}</div>`
        : '<p style="margin:0;color:var(--mute)">Aucun favori : utilisez « ☆ Favori » sur une opération.</p>'}`
        : '<p style="margin:10px 0 0;color:var(--mute)">Favoris et DXF enregistrés : <a href="#" data-gerer>activer le stockage local</a>.</p>'}
      <div class="addbar" style="margin-top:8px"><button type="button" data-all="1">Tout replier</button><button type="button" data-all="0">Tout déplier</button></div>`;
    addBox.querySelectorAll('[data-all]').forEach(b => b.onclick = () => { state.ops.forEach(o => { o.collapsed = b.dataset.all === '1'; }); renderOps(); });
    addBox.querySelectorAll('[data-add]').forEach(b => b.onclick = () => addOp(newOp(b.dataset.add)));
    addBox.querySelectorAll('[data-fav]').forEach(b => b.onclick = () => {
      const f = favs[+b.dataset.fav]; if (!OPS[f.op.type]) return;
      const o = Object.assign(newOp(f.op.type), JSON.parse(JSON.stringify(f.op)));
      if (o.lib) { const d = ST().get('dxf', []).find(x => x.nom === o.lib); if (d) { o.dxfText = d.texte; o.dxfName = d.nom; } }
      if (OPS[o.type].tool && !toolById(o.tool)) o.tool = (TOOLS.find(x => x.type === OPS[o.type].tool) || TOOLS[0] || {}).id;
      addOp(o);
    });
    addBox.querySelectorAll('[data-favdel]').forEach(b => b.onclick = () => { favs.splice(+b.dataset.favdel, 1); ST().set('favoris', favs); renderAdd(); });
    const g = addBox.querySelector('[data-gerer]');
    if (g) g.onclick = e => { e.preventDefault(); window.Stockage && window.Stockage.banniere(true); };
  }

  function renderOut() {
    outBox.innerHTML = `<h3>Programme SimPL</h3>
      <div class="addbar" style="margin-bottom:8px"><button type="button" class="primary" id="g-gen">Générer</button>
      <button type="button" id="g-view">Voir dans le visualiseur</button><button type="button" id="g-dl">Télécharger .simpl</button></div>
      <p class="warn" id="g-warn" role="status"></p>
      <textarea class="genout" id="g-out" spellcheck="false" aria-label="Programme SimPL généré"></textarea>`;
    const out = outBox.querySelector('#g-out'), w = outBox.querySelector('#g-warn');
    const run = () => { const r = generate(state); out.value = r.code; w.innerHTML = r.warn.map(esc).join('<br>'); return r.code; };
    outBox.querySelector('#g-gen').onclick = run;
    outBox.querySelector('#g-view').onclick = () => { const c = out.value || run(); window.simplViewer && window.simplViewer.show(c); };
    outBox.querySelector('#g-dl').onclick = () => {
      const c = out.value || run(), a = el('a', { download: `${ident(state.head.module) || 'Programme'}.simpl`,
        href: URL.createObjectURL(new Blob([c.replace(/\n/g, '\r\n')], { type: 'text/plain' })) });
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
  }

  function init() {
    state.ops = [];                                                 // démarrage vide : l'utilisateur ajoute outils et opérations
    renderHead(); renderTools(); renderOps(); renderAdd(); renderOut();
    document.addEventListener('stockage-change', () => { renderAdd(); renderOps(); });
  }

  // priorité : tools.json enregistré dans ce navigateur, sinon tools.json du site
  const saved = ST() && ST().get('tools');
  if (saved && Array.isArray(saved.tools) && saved.tools.length) { setTools(saved.tools, 'mon tools.json (ce navigateur)'); init(); }
  else fetch('tools.json', { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(j => { setTools(j.tools || [], 'tools.json générique du site'); init(); })
    .catch(() => { setTools([], 'aucune'); init(); renderTools('tools.json introuvable : chargez votre fichier'); });
})();
