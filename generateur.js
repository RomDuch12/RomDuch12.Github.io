/* Générateur SimPL (Datron next) – opérations de base de NeoDrive, bibliothèque d'outils tools.json.
   Tout est calculé dans le navigateur ; rien n'est envoyé. Programme à valider en simulation avant usinage. */
(function () {
  'use strict';
  const root = document.getElementById('gen');
  if (!root) return;

  /* ---------- utilitaires ---------- */
  const tr = (x, v) => (window.t ? window.t(x, v) : x);                  // traduction (i18n.js)
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = (v, d = 3) => { const x = Number(v); return Number.isFinite(x) ? String(+x.toFixed(d)) : '0'; };
  const q = s => String(s).replace(/"/g, "'");                      // chaînes SimPL
  const sansAccents = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[«»]/g, '"').replace(/[’‘]/g, "'").replace(/"/g, "'");
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
    trace: {
      label: 'Tracé (DXF, rectangle, cercle, segment)', tool: 'gravure', prefix: 'Trace', trace: true,
      fields: [P('source', 'Source du tracé', 'select', 'DXF', ['DXF', 'Rectangle', 'Cercle', 'Segment']),
        P('lib', 'DXF enregistré', 'dxflib', '', null, src('DXF')), P('file', 'Importer un dessin (DXF, SVG, PDF, AI, EPS)', 'file', '', null, src('DXF')),
        P('scale', 'Échelle', 'number', 1, null, src('DXF')), P('center', 'Centrer le dessin', 'select', 'oui', ['oui', 'non'], src('DXF')),
        P('offX', 'Décalage X (mm)', 'number', 0, null, src('DXF')), P('offY', 'Décalage Y (mm)', 'number', 0, null, src('DXF')),
        P('cx', 'Centre X', 'number', 0, null, src('Rectangle', 'Cercle')), P('cy', 'Centre Y', 'number', 0, null, src('Rectangle', 'Cercle')),
        P('widthX', 'Largeur X (mm)', 'number', 40, null, src('Rectangle')), P('widthY', 'Largeur Y (mm)', 'number', 20, null, src('Rectangle')),
        P('cornerRadius', 'Rayon des coins (mm)', 'number', 0, null, src('Rectangle')),
        P('diameter', 'Diamètre (mm)', 'number', 20, null, src('Cercle')),
        P('x1', 'X départ', 'number', -20, null, src('Segment')), P('y1', 'Y départ', 'number', 0, null, src('Segment')),
        P('x2', 'X arrivée', 'number', 20, null, src('Segment')), P('y2', 'Y arrivée', 'number', 0, null, src('Segment')),
        P('comp', 'Compensation du rayon d\'outil', 'select', 'sur le tracé', ['sur le tracé', 'extérieur', 'intérieur']),
        P('depth', 'Profondeur (mm)', 'number', 0.2), P('infeedZ', 'Passe Z (mm)', 'number', 0.1)]
    },
    thread: {
      label: 'Taraudage', tool: 'filetage', prefix: 'Taraudage',
      fields: [PTS, P('thread', 'Filetage', 'select', 'M5', ['M3', 'M4', 'M5', 'M6', 'M8', 'M10']), P('depth', 'Profondeur (mm)', 'number', 6),
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
      check: (o, t) => t && t.diameter >= o.diameter ? tr('Perçage-fraisage : l\'outil Ø{a} doit être plus petit que le trou Ø{b}.', { a: t.diameter, b: o.diameter }) : ''
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
      check: (o, t) => t && t.diameter >= Math.min(o.widthX, o.widthY) ? tr('Poche rectangle : l\'outil Ø{a} est trop gros pour la poche.', { a: t.diameter })
        : (t && +o.cornerRadius < t.diameter / 2 ? tr('Poche rectangle : rayon de coin ({r}) < rayon outil ({ro}) : les coins seront arrondis au rayon de l\'outil.', { r: o.cornerRadius, ro: t.diameter / 2 }) : '')
    },
    pocketcircle: {
      label: 'Poche cercle', tool: 'fraise', prefix: 'Poche_Cercle',
      fields: [P('cx', 'Centre X', 'number', 0), P('cy', 'Centre Y', 'number', 0), P('diameter', 'Diamètre (mm)', 'number', 20),
        P('depth', 'Profondeur (mm)', 'number', 2), P('infeedZ', 'Passe Z (mm)', 'number', 0.5),
        P('stepover', 'Recouvrement (% du Ø outil)', 'number', 40), P('finishingXY', 'Finition XY (mm)', 'number', 0.1)],
      seq: (o, t, name) => pocketSequence(name, o, t, 'circle'),
      check: (o, t) => t && t.diameter >= o.diameter ? tr('Poche cercle : l\'outil Ø{a} est trop gros pour la poche Ø{b}.', { a: t.diameter, b: o.diameter }) : ''
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
      fields: [P('message', 'Message', 'text', "Continuer l'usinage ?"),
        P('kind', 'Type de message', 'select', 'question Oui / Non', ['question Oui / Non', 'information seule']),
        P('park', 'Aller en position de parking', 'select', 'oui', ['oui', 'non'], o => o.kind !== 'information seule'),
        P('toolBefore', 'Monter un outil avant la question', 'select', 'non', ['non', 'oui'], o => o.kind !== 'information seule'),
        P('toolArt', 'Outil à monter', 'toolsel', '', null, o => o.kind !== 'information seule' && o.toolBefore === 'oui'),
        P('stop', 'Si « Non »', 'select', 'arrêter la suite', ['arrêter la suite', 'continuer quand même'], o => o.kind !== 'information seule')]
    },
    flip: {
      label: 'Retournement pièce', dialog: true, prefix: 'Retournement',
      fields: [P('message', 'Message', 'text', "Retourner la pièce, palper l'origine, puis continuer ?"),
        P('toolBefore', 'Monter un outil avant la question', 'select', 'non', ['non', 'oui']),
        P('toolArt', 'Outil laissé en broche', 'toolsel', '', null, o => o.toolBefore === 'oui'),
        P('park', 'Aller en position de parking', 'select', 'oui', ['oui', 'non']),
        P('sprayOff', 'Couper l\'arrosage', 'select', 'oui', ['oui', 'non']), P('spindleOff', 'Couper la broche', 'select', 'oui', ['oui', 'non']),
        P('stop', 'Si « Non »', 'select', 'arrêter la suite', ['arrêter la suite', 'continuer quand même']),
        P('probe', 'Palper le brut retourné', 'select', 'oui', ['oui', 'non']),
        P('dimX', 'Dimension X (mm)', 'number', 100, null, o => o.probe === 'oui'), P('dimY', 'Dimension Y (mm)', 'number', 60, null, o => o.probe === 'oui'),
        P('zOff', 'Décalage Z des palpages X/Y (mm)', 'number', -2, null, o => o.probe === 'oui'),
        P('skipZ', 'Palper aussi Z', 'select', 'oui', ['oui', 'non'], o => o.probe === 'oui')]
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
  function flatPath(p) {                         // tracé → polyligne (arcs découpés)
    const l = [[p.x0, p.y0]]; let c = [p.x0, p.y0];
    p.segs.forEach(g => {
      if (g.cx === undefined) l.push([g.x, g.y]);
      else { const r = Math.hypot(c[0] - g.cx, c[1] - g.cy), a0 = Math.atan2(c[1] - g.cy, c[0] - g.cx), a1 = Math.atan2(g.y - g.cy, g.x - g.cx);
        let sw = g.ccw ? a1 - a0 : a0 - a1; while (sw <= 1e-9) sw += 2 * Math.PI; const n = Math.max(6, Math.ceil(sw / 0.05));
        for (let k = 1; k <= n; k++) { const a = a0 + (g.ccw ? 1 : -1) * sw * k / n; l.push([g.cx + r * Math.cos(a), g.cy + r * Math.sin(a)]); } }
      c = [g.x, g.y];
    });
    return l;
  }
  function compense(paths, o, t) {
    if (!o.comp || o.comp === 'sur le tracé' || !t || !(t.diameter > 0) || !window.Vecteurs) return paths;
    // pointe à graver : largeur de coupe à la profondeur demandée (pointe + 2·p·tan(angle/2)), sinon diamètre de l'outil
    const conique = t.type === 'gravure' && t.tipAngle > 0, prof = Math.abs(+o.depth || 0);
    const r = (conique ? Math.min(t.diameter, (t.tipDiameter || 0) + 2 * prof * Math.tan(t.tipAngle * Math.PI / 360)) : t.diameter) / 2, out = [];
    paths.forEach(p => {
      const l = flatPath(p), ferme = l.length > 3 && Math.hypot(l[0][0] - l[l.length - 1][0], l[0][1] - l[l.length - 1][1]) < 1e-3;
      if (!ferme) { out.push(p); return; }                  // tracé ouvert : pas de côté à compenser
      l[l.length - 1] = l[0].slice();
      Vecteurs.offsetContours([l], o.comp === 'extérieur' ? r : -r).forEach(q => { if (q.length > 1) out.push({ x0: q[0][0], y0: q[0][1], segs: q.slice(1).map(([x, y]) => ({ x, y })) }); });
    });
    return out;
  }
  function tracePaths(o, t) {                   // tracé suivi par l'outil (compensation de rayon éventuelle)
    return compense(tracePathsBruts(o), o, t);
  }
  function tracePathsBruts(o) {
    switch (o.source) {
      case 'Rectangle': return [roundRect(+o.cx || 0, +o.cy || 0, Math.abs(o.widthX) / 2, Math.abs(o.widthY) / 2, +o.cornerRadius || 0)];
      case 'Cercle': return +o.diameter > 0 ? [circlePath(+o.cx || 0, +o.cy || 0, o.diameter / 2)] : [];
      case 'Segment': return [{ x0: +o.x1 || 0, y0: +o.y1 || 0, segs: [{ x: +o.x2 || 0, y: +o.y2 || 0 }] }];
      default: return transform(chain(parseDXF(o.dxfText || '').paths), o);
    }
  }
  function traceSequence(name, o, t) {
    const paths = tracePaths(o, t);
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
      t.rpm ? `Rpm = ${t.rpm}` : '# ' + tr('Rpm à renseigner (rotation non définie pour cet outil)'), 'Spindle On',
      feeds ? `SetFeedTechnology (${feeds})` : '# ' + tr('SetFeedTechnology à renseigner (avances non définies pour cet outil)')];
  }

  function generate(state) {
    const h = state.head, warn = [], used = new Map(), programs = [], mainLines = [], seqs = [];
    const names = {}; const uniq = base => { names[base] = (names[base] || 0) + 1; return names[base] > 1 ? `${base}_${names[base]}` : base; };
    let openIfs = 0;
    state.ops.forEach(o => {
      const def = OPS[o.type];
      if (def.inline) { mainLines.push(...def.main(o)); return; }
      if (def.dialog) {
        const msg = sansAccents(o.message || '');
        if (o.type === 'dialog' && o.kind === 'information seule') { mainLines.push('Dialog (', `    caption="Information"`, `    message="${msg}"`, ')'); return; }
        const name = uniq(`${def.prefix}_${state.ops.indexOf(o) + 1}`), tb = o.toolBefore === 'oui' ? toolById(o.toolArt) : null;
        if (o.toolBefore === 'oui' && !tb) warn.push(tr('{op} : aucun outil choisi.', { op: tr(def.label) }));
        programs.push(`# ${tr(def.label)}`, `program ${name} returns DialogResult`,
          ...(tb ? [`    Tool type="${q(tb.articleNr)}"  skipRestoring    #${tb.name}`] : []),
          ...(o.type === 'dialog' ? (o.park !== 'non' ? ['    SpraySystem Off', '    Spindle Off', '    MoveToParkPosition'] : [])
            : [...(o.sprayOff !== 'non' ? ['    SpraySystem Off'] : []), ...(o.spindleOff !== 'non' ? ['    Spindle Off'] : []), ...(o.park !== 'non' ? ['    MoveToParkPosition'] : [])]),
          `    result = Dialog message="${msg}" Yes=true No=true`, '    return result', 'endprogram', '');
        mainLines.push(`result = ${name}`);
        if (o.stop === 'arrêter la suite') { mainLines.push('if result == DialogResult.Yes'); openIfs++; }
        if (o.type === 'flip' && o.probe === 'oui') {         // palpage du brut retourné : même programme que « Palpage rectangle »
          const pn = uniq(OPS.probe.name(o));
          programs.push(`# ${tr('Palpage rectangle')}`, `program ${pn}`, `    BeginBlock name="${pn}"`, ...OPS.probe.body({ ...o, ox: 0, oy: 0, oz: 0 }).map(x => '    ' + x), '    EndBlock', 'endprogram', '');
          mainLines.push(pn);
        }
        return;
      }
      const t = def.tool ? toolById(o.tool) : null;
      if (def.tool && !t) { warn.push(tr('{op} : aucun outil choisi.', { op: tr(def.label) })); return; }
      if (def.check) { const w = def.check(o, t); if (w) warn.push(w); }
      if (t && !used.has(t.id) && (!t.rpm || !Object.values(t.feeds || {}).some(v => v !== undefined && v !== null && v !== '')))
        warn.push(tr('Outil « {n} » : rotation ou avances non renseignées, à compléter dans l\'éditeur d\'outils.', { n: t.name }));
      if (t) used.set(t.id, t);
      const name = uniq(def.name ? def.name(o) : def.prefix);
      let body;
      if (def.trace) {
        if (o.source === 'DXF' && !o.dxfText) { warn.push(tr('{op} : aucun fichier DXF chargé.', { op: tr(def.label) })); return; }
        const seqName = ident(`${name}_${t.id}`).toUpperCase();
        const seq = traceSequence(seqName, o, t);
        if (!seq.count) { warn.push(o.source === 'DXF' ? tr('{op} : aucun tracé exploitable dans « {f} ».', { op: tr(def.label), f: o.dxfName }) : tr('{op} : aucun tracé exploitable.', { op: tr(def.label) })); return; }
        seqs.push({ name: seqName, lines: seq.lines });
        body = [seqName];
      } else if (def.seq) {
        const seqName = ident(`${name}_${t.id}`).toUpperCase();
        seqs.push({ name: seqName, lines: def.seq(o, t, seqName) });
        body = [seqName];
      } else body = def.body(o);
      if (!body.length) { warn.push(tr('{op} : aucune position valide.', { op: tr(def.label) })); return; }
      if (t && (+o.depth || 0) > (t.fluteLength || Infinity)) warn.push(tr('{op} : profondeur {d} mm supérieure à la longueur de coupe de « {n} ».', { op: tr(def.label), d: o.depth, n: t.name }));
      programs.push(`# ${tr(def.label)}${t ? ' – ' + tr('outil') + ' ' + t.name : ''}`, `program ${name}`, `    BeginBlock name="${name}"`, '    SafeZHeightForWorkpiece=0.2',
        ...(t ? ['    SpraySystem On', ...toolBlock(t).map(s => '    ' + s)] : []), ...body.map(s => '    ' + s), '    EndBlock', 'endprogram', '');
      mainLines.push(name);
    });
    for (; openIfs > 0; openIfs--) mainLines.push('endif');

    const bx = +h.bx, by = +h.by, bz = +h.bz;
    const [x0, x1, y0, y1] = [-bx / 2, bx / 2, -by / 2, by / 2];              // origine : centre du brut, dessus de pièce
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
    head: { module: 'CamGeneratedModule', author: 'NeoDrive web', comment: tr('Merci de vérifier le programme avant usinage'), bx: 100, by: 60, bz: 20 },
    ops: []
  };
  const newOp = type => {
    const def = OPS[type], o = { type };
    def.fields.forEach(f => { o[f.k] = f.type === 'text' ? tr(f.def) : f.def; });
    if (def.tool) { const t = TOOLS.find(x => x.type === def.tool) || TOOLS[0]; o.tool = t ? t.id : ''; }
    return o;
  };

  function fieldHTML(f, o, id) {
    if (f.when && !f.when(o)) return '';
    const val = o[f.k];
    if (f.type === 'select') return `<label>${esc(tr(f.label))}<select data-k="${f.k}" id="${id}">${f.opts.map(v => `<option value="${esc(v)}"${v === val ? ' selected' : ''}>${esc(tr(v))}</option>`).join('')}</select></label>`;
    if (f.type === 'points') return `<label class="wide">${esc(tr(f.label))}<textarea data-k="${f.k}" id="${id}" spellcheck="false">${esc(val)}</textarea></label>`;
    if (f.type === 'file') return `<label class="wide">${esc(tr(f.label))}${ST() ? ` <small>(${tr('enregistré dans vos DXF')})</small>` : ''}<input type="file" data-k="${f.k}" id="${id}" accept=".dxf,.svg,.pdf,.ai,.eps,.ps"></label>`;
    if (f.type === 'dxflib') {
      const lib = ST() ? ST().get('dxf', []) : [];
      if (!lib.length) return '';
      return `<label class="wide">${esc(tr(f.label))}<select data-k="${f.k}" id="${id}"><option value="">— ${tr('choisir')} —</option>${lib.map(d =>
        `<option value="${esc(d.nom)}"${d.nom === val ? ' selected' : ''}>${esc(d.nom)} (${Math.max(1, Math.round(d.texte.length / 1024))} ko)</option>`).join('')}</select></label>`;
    }
    if (f.type === 'toolsel') return `<label>${esc(tr(f.label))}<select data-k="${f.k}" id="${id}"><option value="">— ${tr('choisir')} —</option>${TOOLS.map(t =>
      `<option value="${esc(t.id)}"${t.id === val ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>`;
    if (f.type === 'text') return `<label class="wide">${esc(tr(f.label))}<input type="text" data-k="${f.k}" id="${id}" value="${esc(val)}"></label>`;
    return `<label>${esc(tr(f.label))}<input type="number" step="any" data-k="${f.k}" id="${id}" value="${esc(val)}"></label>`;
  }

  const headBox = el('div', { className: 'gbox' });
  const toolBox = el('div', { className: 'gbox' });
  const opsBox = el('div', { className: 'gen' });
  const addBox = el('div', { className: 'gbox' });
  const outBox = el('div', { className: 'gbox' });
  root.append(headBox, toolBox, opsBox, addBox, outBox);

  function renderHead() {
    const H = state.head;
    headBox.innerHTML = `<h3>${tr('En-tête du programme et brut')}</h3><div class="fields">
      <label>${tr('Module')}<input data-h="module" value="${esc(H.module)}"></label>
      <label>${tr('Auteur (Author)')}<input data-h="author" value="${esc(H.author)}"></label>
      <label class="wide">${tr('Commentaire (Comment)')}<input data-h="comment" value="${esc(H.comment)}"></label>
      <label>${tr('Brut X (mm)')}<input type="number" step="any" data-h="bx" value="${H.bx}"></label>
      <label>${tr('Brut Y (mm)')}<input type="number" step="any" data-h="by" value="${H.by}"></label>
      <label>${tr('Brut Z (mm)')}<input type="number" step="any" data-h="bz" value="${H.bz}"></label>
      <p class="wide" style="margin:0;color:var(--mute);font-size:14px;flex-basis:100%">${tr('Origine du programme : centre du brut, sur le dessus de la pièce.')}</p>
    </div>`;
    headBox.querySelectorAll('[data-h]').forEach(i => i.addEventListener('input', () => { H[i.dataset.h] = i.value; auto(); }));
  }

  let toolSource = '';
  function setTools(list, source) {
    TOOLS = list; toolSource = source;
    state.ops.forEach(o => { if (OPS[o.type].tool && !toolById(o.tool)) { const t = TOOLS.find(x => x.type === OPS[o.type].tool) || TOOLS[0]; o.tool = t ? t.id : ''; } });
  }
  function renderTools(msg) {
    toolBox.innerHTML = `<h3>${tr('Bibliothèque d\'outils')}</h3>
      <p style="margin:0 0 8px;color:var(--mute)">${TOOLS.length ? tr('{n} outil(s)', { n: TOOLS.length }) : tr('Bibliothèque vide')} – ${tr('source')} : ${esc(toolSource)}${msg ? ' – ' + esc(msg) : ''}.</p>
      <div class="addbar"><a class="btnlink" href="outils.html">${tr('Éditer mes outils / catalogue DATRON')}</a>
      <button type="button" id="gt-demo">${tr('Set de démarrage (démo)')}</button>
      <label><button type="button" id="gt-load">${tr('Charger un tools.json…')}</button><input type="file" id="gt-file" accept=".json,application/json" hidden></label></div>`;
    toolBox.querySelector('#gt-load').onclick = () => toolBox.querySelector('#gt-file').click();
    toolBox.querySelector('#gt-demo').onclick = () => fetch('tools-demo.json', { cache: 'no-cache' }).then(r => r.json())
      .then(j => { setTools(j.tools, tr('set de démarrage')); renderTools(); renderOps(); }).catch(err => renderTools(tr('erreur : {e}', { e: err.message })));
    toolBox.querySelector('#gt-file').onchange = e => {
      const f = e.target.files[0]; if (!f) return;
      f.text().then(t => { const j = window.OutilsFormat ? OutilsFormat.normaliser(JSON.parse(t)) : JSON.parse(t); if (!Array.isArray(j.tools)) throw new Error(tr('clé « tools » absente'));
        setTools(j.tools, f.name);
        const saved = ST() && ST().set('tools', j);
        renderTools(saved ? tr('enregistré dans ce navigateur') : ''); renderOps(); })
        .catch(err => renderTools(tr('erreur : {e}', { e: err.message })));
    };
  }

  function saveDxf(nom, texte) {
    if (!ST()) return;
    const lib = ST().get('dxf', []).filter(d => d.nom !== nom);
    lib.unshift({ nom, date: new Date().toISOString(), texte });
    ST().set('dxf', lib.slice(0, 30));
  }

  function renderOps() {
    auto();
    opsBox.innerHTML = state.ops.length ? '' : `<p class="gbox" style="margin:0;color:var(--mute)">${TOOLS.length ? tr('Aucune opération : ajoutez-en ci-dessous.') : tr('Aucune opération : ajoutez-en ci-dessous, après avoir créé vos outils dans l\'<a href="outils.html">éditeur d\'outils</a> (catalogue DATRON).')}</p>`;
    state.ops.forEach((o, idx) => {
      const def = OPS[o.type], box = el('div', { className: 'gbox op' });
      const tools = def.tool ? `<label>${tr('Outil')}<select data-k="tool">${TOOLS.map(t => `<option value="${esc(t.id)}"${t.id === o.tool ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>` : '';
      const t = def.tool ? toolById(o.tool) : null;
      const resume = [t && t.name, def.trace && (o.source === 'DXF' ? o.dxfName : tr(o.source))].filter(Boolean).join(' · ');
      box.innerHTML = `<div class="ophead"><h3>${idx + 1}. ${esc(tr(def.label))}${o.collapsed && resume ? `<small> – ${esc(resume)}</small>` : ''}</h3>
        ${ST() ? `<button type="button" data-a="fav" title="${tr('Enregistrer comme opération favorite')}">☆ ${tr('Favori')}</button>` : ''}
        <button type="button" data-a="toggle" aria-expanded="${!o.collapsed}" aria-controls="opf${idx}">${o.collapsed ? tr('Afficher') : tr('Masquer')}</button>
        <button type="button" data-a="up" aria-label="${tr('Monter')}">▲</button><button type="button" data-a="down" aria-label="${tr('Descendre')}">▼</button>
        <button type="button" data-a="del">${tr('Supprimer')}</button></div>
        <div id="opf${idx}"${o.collapsed ? ' hidden' : ''}>
        <div class="${def.trace ? 'opgrid' : ''}"><div class="fields">${tools}${def.fields.map((f, k) => fieldHTML(f, o, `op${idx}_${k}`)).join('')}</div>
        ${def.trace ? `<figure class="thumb"><canvas width="220" height="160" aria-label="${esc(tr('Aperçu du tracé'))}"></canvas><figcaption></figcaption></figure>` : ''}</div></div>`;
      box.querySelector('[data-a=toggle]').onclick = () => { o.collapsed = !o.collapsed; renderOps(); };
      if (def.trace && !o.collapsed) drawThumb(box.querySelector('.thumb'), o);
      const fav = box.querySelector('[data-a=fav]');
      if (fav) fav.onclick = () => {
        const nom = prompt(tr('Nom de l\'opération favorite :'), resume ? `${tr(def.label)} – ${resume}` : tr(def.label));
        if (!nom) return;
        const copie = JSON.parse(JSON.stringify(o)); delete copie.dxfText; delete copie.collapsed;
        const favs = ST().get('favoris', []).filter(x => x.nom !== nom);
        favs.push({ nom, op: copie }); ST().set('favoris', favs); renderAdd();
      };
      box.querySelectorAll('[data-k]').forEach(i => {
        const k = i.dataset.k;
        if (i.type === 'file') i.onchange = e => { const f = e.target.files[0]; if (!f) return;
          const lire = /\.dxf$/i.test(f.name) || !window.Vecteurs ? f.text()
            : Vecteurs.read(f).then(r => Vecteurs.toDXF(Vecteurs.join(r.items.map(it => it.poly.map(([x, y]) => [x * (r.unitScale || 1), y * (r.unitScale || 1)])))));
          lire.then(tx => { o.dxfText = tx; o.dxfName = f.name; o.lib = f.name; saveDxf(f.name, tx); renderOps(); })
            .catch(err => alert(tr('Lecture impossible : {e}', { e: err.message }))); };
        else if (k === 'lib') i.addEventListener('change', () => { const d = (ST() ? ST().get('dxf', []) : []).find(x => x.nom === i.value);
          o.lib = i.value; if (d) { o.dxfText = d.texte; o.dxfName = d.nom; } renderOps(); });
        else if (k === 'source') i.addEventListener('change', () => { o.source = i.value; renderOps(); });
        else if (i.tagName === 'SELECT' && OPS[o.type].fields.some(f => f.when)) i.addEventListener('change', () => { o[k] = i.value; renderOps(); });
        else i.addEventListener('input', () => { o[k] = i.value; if (def.trace) drawThumb(box.querySelector('.thumb'), o); auto(); });
      });
      box.querySelector('[data-a=up]').onclick = () => { if (idx > 0) { state.ops.splice(idx - 1, 0, state.ops.splice(idx, 1)[0]); renderOps(); } };
      box.querySelector('[data-a=down]').onclick = () => { if (idx < state.ops.length - 1) { state.ops.splice(idx + 1, 0, state.ops.splice(idx, 1)[0]); renderOps(); } };
      box.querySelector('[data-a=del]').onclick = () => { state.ops.splice(idx, 1); renderOps(); };
      opsBox.append(box);
    });
  }

  /* miniature : tracé tel qu'il sera usiné, dans le cadre du brut */
  function drawThumb(fig, o) {
    if (!fig) return;
    const cv = fig.querySelector('canvas'), cap = fig.querySelector('figcaption'), x = cv.getContext('2d'), css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
    const W = cv.width, H = cv.height; x.clearRect(0, 0, W, H);
    let paths = [];
    try { paths = o.source === 'DXF' && !o.dxfText ? [] : tracePaths(o, toolById(o.tool)); } catch (e) { paths = []; }
    const pts = []; const flat = paths.map(p => { const l = [[p.x0, p.y0]]; let c = [p.x0, p.y0];
      p.segs.forEach(g => { if (g.cx === undefined) l.push([g.x, g.y]); else { const r = Math.hypot(c[0] - g.cx, c[1] - g.cy); let a0 = Math.atan2(c[1] - g.cy, c[0] - g.cx), a1 = Math.atan2(g.y - g.cy, g.x - g.cx);
        let sw = g.ccw ? a1 - a0 : a0 - a1; while (sw <= 1e-9) sw += 2 * Math.PI; const n = Math.max(6, Math.ceil(sw / 0.2));
        for (let k = 1; k <= n; k++) { const a = a0 + (g.ccw ? 1 : -1) * sw * k / n; l.push([g.cx + r * Math.cos(a), g.cy + r * Math.sin(a)]); } } c = [g.x, g.y]; });
      l.forEach(q => pts.push(q)); return l; });
    const H0 = state.head, bx = +H0.bx || 100, by = +H0.by || 60, [bx0, by0] = [-bx / 2, -by / 2];
    const xs = pts.map(p => p[0]).concat([bx0, bx0 + bx]), ys = pts.map(p => p[1]).concat([by0, by0 + by]);
    const X0 = Math.min(...xs), X1 = Math.max(...xs), Y0 = Math.min(...ys), Y1 = Math.max(...ys), k = Math.min((W - 16) / ((X1 - X0) || 1), (H - 16) / ((Y1 - Y0) || 1));
    const ox = (W - (X1 - X0) * k) / 2, oy = (H - (Y1 - Y0) * k) / 2, SX = v => ox + (v - X0) * k, SY = v => H - oy - (v - Y0) * k;
    x.fillStyle = css('--card'); x.strokeStyle = css('--line'); x.fillRect(SX(bx0), SY(by0 + by), bx * k, by * k); x.strokeRect(SX(bx0), SY(by0 + by), bx * k, by * k);
    x.strokeStyle = css('--brass'); x.lineWidth = 1.2; x.beginPath();
    flat.forEach(l => l.forEach(([a, b], i) => (i ? x.lineTo(SX(a), SY(b)) : x.moveTo(SX(a), SY(b))))); x.stroke();
    if (!pts.length) { cap.textContent = o.source === 'DXF' ? tr('Aucun DXF chargé') : tr('Aucun tracé exploitable.'); return; }
    const w = Math.max(...pts.map(p => p[0])) - Math.min(...pts.map(p => p[0])), h = Math.max(...pts.map(p => p[1])) - Math.min(...pts.map(p => p[1]));
    const sort = pts.some(p => p[0] < bx0 - 1e-6 || p[0] > bx0 + bx + 1e-6 || p[1] < by0 - 1e-6 || p[1] > by0 + by + 1e-6);
    cap.innerHTML = `${o.source === 'DXF' ? esc(o.dxfName || '') + ' · ' : ''}${tr('{n} tracé(s)', { n: paths.length })} · ${(+w).toFixed(2)} × ${(+h).toFixed(2)} mm${sort ? ` · <b style="color:var(--warn)">${tr('hors du brut')}</b>` : ''}`;
  }

  function addOp(o) { state.ops.push(o); renderOps(); opsBox.lastChild.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }

  function renderAdd() {
    const favs = ST() ? ST().get('favoris', []) : [];
    addBox.innerHTML = `<h3>${tr('Ajouter une opération')}</h3><div class="addbar">${Object.entries(OPS).map(([k, d]) => `<button type="button" data-add="${k}">+ ${esc(tr(d.label))}</button>`).join('')}</div>
      ${ST() ? `<h3 style="margin-top:12px">${tr('Mes favoris')}</h3>${favs.length ? `<div class="addbar">${favs.map((f, i) =>
        `<span class="favchip"><button type="button" data-fav="${i}">★ ${esc(f.nom)}</button><button type="button" data-favdel="${i}" aria-label="${esc(tr('Retirer {n} des favoris', { n: f.nom }))}">✕</button></span>`).join('')}</div>`
        : `<p style="margin:0;color:var(--mute)">${tr('Aucun favori : utilisez « ☆ Favori » sur une opération.')}</p>`}`
        : `<p style="margin:10px 0 0;color:var(--mute)">${tr('Favoris et DXF enregistrés : <a href="#" data-gerer>activer le stockage local</a>.')}</p>`}
      <div class="addbar" style="margin-top:8px"><button type="button" data-all="1">${tr('Tout replier')}</button><button type="button" data-all="0">${tr('Tout déplier')}</button></div>`;
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

  let runGen = null, autoT = 0;
  const auto = () => { clearTimeout(autoT); autoT = setTimeout(() => runGen && state.ops.length && runGen(), 500); };
  function renderOut() {
    outBox.innerHTML = `<h3>${tr('Programme SimPL')}</h3>
      <div class="addbar" style="margin-bottom:8px"><button type="button" class="primary" id="g-gen">${tr('Générer')}</button>
      <button type="button" id="g-view">${tr('Voir dans le visualiseur')}</button><button type="button" id="g-dl">${tr('Télécharger .simpl')}</button>
      <button type="button" id="g-share">${tr('Partager (lien)')}</button></div>
      <p class="warn" id="g-warn" role="status"></p>
      <div class="genout" id="g-out" aria-label="${tr('Programme SimPL généré')}"></div>`;
    const w = outBox.querySelector('#g-warn'); let ed = null, pending = '';
    const out = { get value() { return ed ? ed.getValue() : pending; }, set value(v) { pending = v; if (ed) ed.setValue(v); } };
    if (window.SimplEditor) SimplEditor.create(outBox.querySelector('#g-out'), { value: pending, onChange: v => { pending = v; window.simplViewer && window.simplViewer.generated(v); } })
      .then(e => { ed = e; ed.setValue(pending); }).catch(() => { outBox.querySelector('#g-out').innerHTML = '<textarea class="genout" spellcheck="false"></textarea>'; });
    const run = () => { const r = generate(state); out.value = r.code; w.innerHTML = r.warn.map(esc).join('<br>');
      if (state.ops.length && window.simplViewer) window.simplViewer.generated(r.code); return r.code; };
    runGen = run;
    outBox.querySelector('#g-gen').onclick = run;
    outBox.querySelector('#g-share').onclick = () => {        // en-tête, opérations (DXF compris) et outils utilisés
      const ops = state.ops.map(({ collapsed, ...o }) => o), ids = new Set(ops.flatMap(o => [o.tool, o.toolArt]).filter(Boolean));
      window.Partage && Partage.lien('p', { format: 'neodrive-web', version: 1, head: state.head, ops, tools: TOOLS.filter(t => ids.has(t.id)) });
    };
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
    // programme reçu par lien de partage (#p=…) : ses outils s'ajoutent à la bibliothèque
    const recu = window.Partage && Partage.lire('p');
    if (recu) recu.then(o => { if (!Array.isArray(o.ops)) return;
      (o.tools || []).forEach(t => { if (!toolById(t.id)) TOOLS.push(t); });
      Object.assign(state.head, o.head || {}); state.ops = o.ops.filter(x => OPS[x.type]);
      renderHead(); renderTools(tr('outils du lien de partage ajoutés')); renderOps(); document.getElementById('sec-gen').scrollIntoView();
    }).catch(e => alert(tr('Lien de partage illisible : {e}', { e: e.message })));
    document.addEventListener('stockage-change', () => { renderAdd(); renderOps(); });
  }

  // priorité : tools.json enregistré dans ce navigateur, sinon tools.json du site
  const saved = ST() && ST().get('tools');
  if (saved && Array.isArray(saved.tools) && saved.tools.length) { setTools(saved.tools, tr('mon tools.json (ce navigateur)')); init(); }
  else fetch('tools.json', { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(j => { setTools(j.tools || [], tr('tools.json du site')); init(); })
    .catch(() => { setTools([], tr('aucune')); init(); renderTools(tr('tools.json introuvable : chargez votre fichier')); });
})();
