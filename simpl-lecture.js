/* Lecture d'un programme SimPL pour le visualiseur : trajectoire dans l'ordre d'exécution (Main puis les programmes
   et séquences appelés), décalages ShiftWcsInc, outils (diamètre d'après @ ToolDescription), avances
   (SetFeedTechnology + Feed …) et temps d'usinage estimé. Sans DOM : utilisable dans le navigateur et dans les tests. */
(function (root) {
  'use strict';
  const NUM = '(-?\\d*\\.?\\d+)';
  const reAxyz = new RegExp('^\\s*Axyz\\s+\\d+\\s*,\\s*' + NUM + '\\s*,\\s*' + NUM + '\\s*,\\s*' + NUM, 'i');
  const reAxis = new RegExp('\\b([XYZ])\\s*=?\\s*' + NUM, 'gi');
  const RAPIDE = 20000;          // mm/min supposés pour les déplacements rapides (estimation)
  const AVANCE_DEFAUT = 1000;    // mm/min si le programme ne donne aucune avance

  function parse(src) {
    const lines = String(src).replace(/\r/g, '').split('\n'), pts = [], origins = [];
    let p = { x: 0, y: 0, z: 10 }, off = { x: 0, y: 0, z: 0 };
    let feeds = {}, mode = 'roughing', tool = null, rapidLine = false, feedKnown = false;
    const tools = {};                                   // article → diamètre
    const progs = {}, seqs = {};
    lines.forEach((l, i) => {
      const td = l.match(/@\s*ToolDescription\s*:(.*)@/);
      if (td) { const a = td[1].match(/"ArticleNr"\s*:\s*"([^"]*)"/), d = td[1].match(/"Diameter"\s*:\s*(-?[\d.]+)/); if (a && d) tools[a[1]] = +d[1]; }
      const m = l.match(/^\s*(?:export\s+)?program\s+(\w+)/i);
      if (m) { let e = i + 1; while (e < lines.length && !/^\s*endprogram\b/i.test(lines[e])) e++; progs[m[1]] = [i + 1, e]; }
      const q = l.match(/^\s*\$\$\$\s+(\w+)/);
      if (q) { let e = i + 1; while (e < lines.length && !/^\s*\$\$\$/.test(lines[e]) && !/^\s*sequence\s/i.test(lines[e])) e++; seqs[q[1]] = [i + 1, e]; }
    });
    const dia = () => (tool && tools[tool] !== undefined ? tools[tool] : null);
    const push = (pt, i, cut) => pts.push({ ...pt, line: i, rapid: !cut, f: cut ? (feeds[mode] || null) : null, d: dia() });
    function step(raw, i) {
      const sh = raw.match(/^\s*ShiftWcsInc\b(.*)/i);
      if (sh) {
        const g = k => { const r = sh[1].match(new RegExp('\\b' + k + '\\s*=\\s*' + NUM, 'i')); return r ? +r[1] : 0; };
        off = { x: off.x + g('X'), y: off.y + g('Y'), z: off.z + g('Z') }; origins.push({ x: off.x, y: off.y, line: i }); return;
      }
      const tl = raw.match(/^\s*Tool\s+type\s*=\s*"([^"]*)"/i); if (tl) { tool = tl[1]; return; }
      const sf = raw.match(/^\s*SetFeedTechnology\s*\((.*)\)/i);
      if (sf) { sf[1].replace(/(\w+)\s*=\s*(-?[\d.]+)/g, (_, k, v) => { feeds[k.toLowerCase()] = +v; }); feedKnown = true; return; }
      const fm = raw.match(/^\s*Feed\s+(\w+)/i); if (fm) { mode = fm[1].toLowerCase(); return; }
      if (/^\s*(ShiftWcs|#|@)/i.test(raw)) return;
      const l = raw.replace(/\/\/.*$|;.*$|\{[^}]*\}|\([^)]*\)/g, '');
      rapidLine = /^\s*(Rapid|SafeRapid|PrePositioning)\b/i.test(l);
      const n = { ...p }; let hit = false; const m = l.match(reAxyz);
      const arc = l.match(/^\s*Arc\s+(CW|CCW)\b/i);
      if (arc) {
        const g = k => { const r = l.match(new RegExp('\\b' + k + '\\s*=\\s*' + NUM)); return r ? +r[1] : null; };
        const gx = g('X'), gy = g('Y'), ex = gx === null ? p.x : gx + off.x, ey = gy === null ? p.y : gy + off.y;
        const cx = p.x + (g('dX') ?? 0), cy = p.y + (g('dY') ?? 0), r = Math.hypot(p.x - cx, p.y - cy);
        const a0 = Math.atan2(p.y - cy, p.x - cx), a1 = Math.atan2(ey - cy, ex - cx), ccw = arc[1].toUpperCase() === 'CCW';
        let sw = ccw ? a1 - a0 : a0 - a1; while (sw <= 1e-9) sw += 2 * Math.PI;
        const steps = Math.max(4, Math.ceil(sw / 0.15));
        for (let k = 1; k <= steps; k++) { const a = a0 + (ccw ? 1 : -1) * sw * k / steps; push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), z: p.z }, i, p.z <= 0); }
        p = { ...p, x: ex, y: ey }; return;
      }
      const cyc = raw.match(/^\s*(Drill|DrillMilling|CircleFromMid|CircleFace|Thread|RectFromMid|RectangleFace)\s*\(/);
      if (cyc) {                                        // cycles machine : tracé approché à la profondeur
        const g = k => { const r = raw.match(new RegExp('\\b' + k + '\\s*=\\s*' + NUM)); return r ? +r[1] : null; };
        const z = -(g('depth') ?? 1) + off.z, P = (x, y) => push({ x, y, z }, i, true);
        if (cyc[1] === 'Drill') P(p.x, p.y);
        else if (/Rect/.test(cyc[1])) { const w = (g('widthX') ?? 10) / 2, h = (g('widthY') ?? 10) / 2; [[-w, -h], [w, -h], [w, h], [-w, h], [-w, -h]].forEach(([a, b]) => P(p.x + a, p.y + b)); }
        else { const tn = l.match(/threadName="M(\d+(?:\.\d+)?)"/), r = (g('diameter') ?? (tn ? +tn[1] : 5)) / 2; for (let k = 0; k <= 24; k++) { const a = k / 24 * 2 * Math.PI; P(p.x + r * Math.cos(a), p.y + r * Math.sin(a)); } }
        push({ ...p }, i, false); return;
      }
      if (m) { n.x = +m[1] + off.x; n.y = +m[2] + off.y; n.z = +m[3] + off.z; hit = true; }
      else { let a; reAxis.lastIndex = 0; while ((a = reAxis.exec(l))) { const k = a[1].toLowerCase(); n[k] = +a[2] + off[k]; hit = true; } }
      if (hit) { push(n, i, !rapidLine && n.z <= 0); p = n; }      // coupe : mouvement qui finit dans la matière (Z ≤ 0)
    }
    const call = l => { const m = l.match(/^\s*(?:\w+\s*=\s*)?([A-Za-z_]\w*)\s*$/); return m && (progs[m[1]] || seqs[m[1]]) ? (progs[m[1]] || seqs[m[1]]) : null; };
    function run(a, b, depth) {
      for (let i = a; i < b; i++) { const r = call(lines[i]); if (r) { if (depth < 20) run(r[0], r[1], depth + 1); continue; } step(lines[i], i); }
    }
    if (progs.Main) run(progs.Main[0], progs.Main[1], 0); else run(0, lines.length, 0);
    return { lines, pts, origins, tools, ...stats(pts, feedKnown) };
  }
  /* longueurs et temps : coupe à l'avance du mode en cours, rapides à RAPIDE */
  function stats(pts, feedKnown) {
    let cut = 0, rapid = 0, tCut = 0, tRapid = 0, zmin = Infinity, sansAvance = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      if (b.z < zmin) zmin = b.z;
      if (b.rapid) { rapid += L; tRapid += L / RAPIDE * 60; }
      else { cut += L; const f = b.f || AVANCE_DEFAUT; if (!b.f) sansAvance += L; tCut += L / f * 60; }
    }
    return { cut, rapid, zmin: pts.length ? Math.min(zmin, pts[0].z) : 0, time: tCut + tRapid, timeCut: tCut, timeRapid: tRapid, feedKnown: feedKnown && sansAvance < 1e-6 };
  }
  root.SimplLecture = { parse, RAPIDE, AVANCE_DEFAUT };
})(typeof window !== 'undefined' ? window : globalThis);
