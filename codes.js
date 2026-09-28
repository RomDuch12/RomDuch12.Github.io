/* Codes 2D et linéaires – portés de TauDrive (engrave/barcode.py) : DataMatrix ECC200, QR Code (versions 1 à 10),
   Code 39, EAN-13, et Code 128 (sous-ensembles B et C). Matrices de booléens [ligne][colonne], ligne 0 en haut. */
(function () {
  'use strict';
  // corps de Galois GF(256), polynôme 0x12D, première racine alpha^1
  const EXP = new Array(512).fill(0), LOG = new Array(256).fill(0);
  (() => { let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x *= 2; if (x >= 256) x ^= 0x12D; } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; })();
  const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
  function genPoly(n) { let p = [1]; for (let i = 0; i < n; i++) { const q = [1, EXP[i + 1]], o = new Array(p.length + 1).fill(0); p.forEach((a, k) => q.forEach((b, j) => { o[k + j] ^= mul(a, b); })); p = o; } return p; }
  function remainder(data, n) {
    const g = genPoly(n); let rest = new Array(n).fill(0);
    for (const byte of data) { const f = byte ^ rest[0]; rest = rest.slice(1).concat(0); if (f) for (let i = 1; i < g.length; i++) rest[i - 1] ^= mul(g[i], f); }
    return rest;
  }
  // (lignes, colonnes, lignes de région, colonnes de région, régions Y, régions X, octets de données, octets de correction, blocs)
  const SQUARE = [[10, 10, 8, 8, 1, 1, 3, 5, 1], [12, 12, 10, 10, 1, 1, 5, 7, 1], [14, 14, 12, 12, 1, 1, 8, 10, 1], [16, 16, 14, 14, 1, 1, 12, 12, 1],
    [18, 18, 16, 16, 1, 1, 18, 14, 1], [20, 20, 18, 18, 1, 1, 22, 18, 1], [22, 22, 20, 20, 1, 1, 30, 20, 1], [24, 24, 22, 22, 1, 1, 36, 24, 1],
    [26, 26, 24, 24, 1, 1, 44, 28, 1], [32, 32, 14, 14, 2, 2, 62, 36, 1], [36, 36, 16, 16, 2, 2, 86, 42, 1], [40, 40, 18, 18, 2, 2, 114, 48, 1],
    [44, 44, 20, 20, 2, 2, 144, 56, 1], [48, 48, 22, 22, 2, 2, 174, 68, 1], [52, 52, 24, 24, 2, 2, 204, 42, 2]];
  const RECT = [[8, 18, 6, 16, 1, 1, 5, 7, 1], [8, 32, 6, 14, 1, 2, 10, 11, 1], [12, 26, 10, 24, 1, 1, 16, 14, 1], [12, 36, 10, 16, 1, 2, 22, 18, 1],
    [16, 36, 14, 16, 1, 2, 32, 24, 1], [16, 48, 14, 22, 1, 2, 49, 28, 1]];
  const candidates = shape => (shape === 'rect' ? RECT : shape === 'auto' ? SQUARE.concat(RECT).sort((a, b) => a[6] - b[6] || a[0] * a[1] - b[0] * b[1]) : SQUARE);
  function encodeASCII(bytes) {
    const out = [];
    for (let i = 0; i < bytes.length;) {
      const a = bytes[i];
      if (a >= 48 && a <= 57 && i + 1 < bytes.length && bytes[i + 1] >= 48 && bytes[i + 1] <= 57) { out.push((a - 48) * 10 + (bytes[i + 1] - 48) + 130); i += 2; }
      else if (a < 128) { out.push(a + 1); i++; }
      else { out.push(235, a - 128 + 1); i++; }
    }
    return out;
  }
  function pad(w, cap) {
    w = w.slice();
    if (w.length < cap) { w.push(129); while (w.length < cap) { const pos = w.length + 1, v = 129 + ((149 * pos) % 253) + 1; w.push(v > 254 ? v - 254 : v); } }
    return w.slice(0, cap);
  }
  function ecc(w, size) {
    const n = size[7], blocks = size[8], all = new Array(n * blocks).fill(0);
    for (let b = 0; b < blocks; b++) { const block = blocks > 1 ? w.filter((_, i) => i % blocks === b) : w; remainder(block, n).forEach((v, i) => { all[i * blocks + b] = v; }); }
    return w.concat(all);
  }
  function place(words, rows, cols) {                     // placement nominal (annexe F)
    const g = Array.from({ length: rows }, () => new Array(cols).fill(null));
    const put = (r, c, bit) => { if (r < 0) { r += rows; c += 4 - ((rows + 4) % 8); } if (c < 0) { c += cols; r += 4 - ((cols + 4) % 8); } g[r][c] = bit; };
    const utah = (r, c, ch) => { const b = words[ch];
      [[r - 2, c - 2], [r - 2, c - 1], [r - 1, c - 2], [r - 1, c - 1], [r - 1, c], [r, c - 2], [r, c - 1], [r, c]].forEach(([y, x], i) => put(y, x, (b >> (7 - i)) & 1)); };
    const corner = (kind, ch) => { const b = words[ch], spots = {
      1: [[rows - 1, 0], [rows - 1, 1], [rows - 1, 2], [0, cols - 2], [0, cols - 1], [1, cols - 1], [2, cols - 1], [3, cols - 1]],
      2: [[rows - 3, 0], [rows - 2, 0], [rows - 1, 0], [0, cols - 4], [0, cols - 3], [0, cols - 2], [0, cols - 1], [1, cols - 1]],
      3: [[rows - 3, 0], [rows - 2, 0], [rows - 1, 0], [0, cols - 2], [0, cols - 1], [1, cols - 1], [2, cols - 1], [3, cols - 1]],
      4: [[rows - 1, 0], [rows - 1, cols - 1], [0, cols - 3], [0, cols - 2], [0, cols - 1], [1, cols - 3], [1, cols - 2], [1, cols - 1]] }[kind];
      spots.forEach(([y, x], i) => { g[y][x] = (b >> (7 - i)) & 1; }); };
    let ch = 0, row = 4, col = 0;
    for (;;) {
      if (row === rows && col === 0) corner(1, ch++);
      else if (row === rows - 2 && col === 0 && cols % 4) corner(2, ch++);
      else if (row === rows - 2 && col === 0 && cols % 8 === 4) corner(3, ch++);
      else if (row === rows + 4 && col === 2 && cols % 8 === 0) corner(4, ch++);
      do { if (row < rows && col >= 0 && g[row][col] === null) utah(row, col, ch++); row -= 2; col += 2; } while (row >= 0 && col < cols);
      row += 1; col += 3;
      do { if (row >= 0 && col < cols && g[row][col] === null) utah(row, col, ch++); row += 2; col -= 2; } while (row < rows && col >= 0);
      row += 3; col += 1;
      if (!(row < rows || col < cols)) break;
    }
    if (g[rows - 1][cols - 1] === null) { g[rows - 1][cols - 1] = 1; g[rows - 2][cols - 2] = 1; g[rows - 1][cols - 2] = 0; g[rows - 2][cols - 1] = 0; }
    return g.map(l => l.map(v => !!v));
  }
  function encode(text, shape = 'square') {
    const bytes = [...String(text)].map(ch => { const c = ch.charCodeAt(0); return c < 256 ? c : 63; });
    const words = encodeASCII(bytes), size = candidates(shape).find(s => s[6] >= words.length);
    if (!size) throw new Error((window.t || (x => x))('Donnée trop longue pour un DataMatrix ({n} octets).', { n: words.length }));
    const [rows, cols, rr, rc, ry, rx, len] = size, nominal = place(ecc(pad(words, len), size), rr * ry, rc * rx);
    const out = Array.from({ length: rows }, () => new Array(cols).fill(false));
    for (let y = 0; y < ry; y++) for (let x = 0; x < rx; x++) {
      const top = y * (rr + 2), left = x * (rc + 2);
      for (let i = 0; i < rc + 2; i++) { out[top + rr + 1][left + i] = true; out[top][left + i] = i % 2 === 0; }
      for (let i = 0; i < rr + 2; i++) { out[top + i][left] = true; out[top + i][left + rc + 1] = i % 2 === 1; }
      for (let a = 0; a < rr; a++) for (let b = 0; b < rc; b++) out[top + a + 1][left + b + 1] = nominal[y * rr + a][x * rc + b];
    }
    return out;
  }
  window.DataMatrix = { encode };
})();

(function () {
  'use strict';
  const T = (s, v) => (window.t ? window.t(s, v) : s);
  /* ---------- QR Code, mode octet, versions 1 à 10 ---------- */
  const EXP = new Array(512).fill(0), LOG = new Array(256).fill(0);
  (() => { let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x *= 2; if (x >= 256) x ^= 0x11D; } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; })();
  const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
  function remainder(data, n) {
    let g = [1];
    for (let i = 0; i < n; i++) { const o = new Array(g.length + 1).fill(0); g.forEach((a, k) => { o[k] ^= a; o[k + 1] ^= mul(a, EXP[i]); }); g = o; }
    let rest = new Array(n).fill(0);
    for (const b of data) { const f = b ^ rest[0]; rest = rest.slice(1).concat(0); if (f) for (let i = 1; i < g.length; i++) rest[i - 1] ^= mul(g[i], f); }
    return rest;
  }
  const EC = { 1: { L: [7, 1, 0], M: [10, 1, 0], Q: [13, 1, 0], H: [17, 1, 0] }, 2: { L: [10, 1, 0], M: [16, 1, 0], Q: [22, 1, 0], H: [28, 1, 0] },
    3: { L: [15, 1, 0], M: [26, 1, 0], Q: [18, 2, 0], H: [22, 2, 0] }, 4: { L: [20, 1, 0], M: [18, 2, 0], Q: [26, 2, 0], H: [16, 4, 0] },
    5: { L: [26, 1, 0], M: [24, 2, 0], Q: [18, 2, 2], H: [22, 2, 2] }, 6: { L: [18, 2, 0], M: [16, 4, 0], Q: [24, 4, 0], H: [28, 4, 0] },
    7: { L: [20, 2, 0], M: [18, 4, 0], Q: [18, 2, 4], H: [26, 4, 1] }, 8: { L: [24, 2, 0], M: [22, 2, 2], Q: [22, 4, 2], H: [26, 4, 2] },
    9: { L: [30, 2, 0], M: [22, 3, 2], Q: [20, 4, 4], H: [24, 4, 4] }, 10: { L: [18, 2, 2], M: [26, 4, 1], Q: [24, 6, 2], H: [28, 6, 2] } };
  const TOTAL = { 1: 26, 2: 44, 3: 70, 4: 100, 5: 134, 6: 172, 7: 196, 8: 242, 9: 292, 10: 346 };
  const ALIGN = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50] };
  const LVL = { L: 1, M: 0, Q: 3, H: 2 };
  function blocks(v, l) { const [ec, s, lo] = EC[v][l], n = s + lo, td = TOTAL[v] - ec * n, b = Math.floor(td / n); return [ec, Array(s).fill(b).concat(Array(lo).fill(b + 1))]; }
  const sum = a => a.reduce((x, y) => x + y, 0);
  const capacity = (v, l) => Math.floor((sum(blocks(v, l)[1]) * 8 - (4 + (v < 10 ? 8 : 16))) / 8);
  function bitstream(data, v, l) {
    const [ec, sizes] = blocks(v, l), bits = [], push = (val, w) => { for (let i = w - 1; i >= 0; i--) bits.push((val >> i) & 1); };
    push(4, 4); push(data.length, v < 10 ? 8 : 16); data.forEach(b => push(b, 8));
    const cap = sum(sizes) * 8; push(0, Math.min(4, cap - bits.length));
    while (bits.length % 8) bits.push(0);
    for (let i = 0; bits.length < cap; i++) push(i % 2 ? 0x11 : 0xEC, 8);
    const words = []; for (let k = 0; k < bits.length; k += 8) words.push(bits.slice(k, k + 8).reduce((a, b) => (a << 1) | b, 0));
    const groups = [], eccs = []; let off = 0;
    for (const n of sizes) { const b = words.slice(off, off + n); off += n; groups.push(b); eccs.push(remainder(b, ec)); }
    const out = [];
    for (let i = 0; i < Math.max(...sizes); i++) groups.forEach(b => { if (i < b.length) out.push(b[i]); });
    for (let i = 0; i < ec; i++) eccs.forEach(b => out.push(b[i]));
    const s = []; out.forEach(b => { for (let i = 7; i >= 0; i--) s.push((b >> i) & 1); });
    return s;
  }
  function skeleton(v) {
    const n = v * 4 + 17, g = Array.from({ length: n }, () => new Array(n).fill(false)), fx = Array.from({ length: n }, () => new Array(n).fill(false));
    const finder = (t, l) => { for (let y = -1; y < 8; y++) for (let x = -1; x < 8; x++) { const r = t + y, c = l + x; if (r < 0 || c < 0 || r >= n || c >= n) continue;
      g[r][c] = (y >= 0 && y <= 6 && (x === 0 || x === 6)) || (x >= 0 && x <= 6 && (y === 0 || y === 6)) || (x >= 2 && x <= 4 && y >= 2 && y <= 4); fx[r][c] = true; } };
    finder(0, 0); finder(0, n - 7); finder(n - 7, 0);
    for (let i = 8; i < n - 8; i++) { g[6][i] = g[i][6] = i % 2 === 0; fx[6][i] = fx[i][6] = true; }
    for (const cy of ALIGN[v]) for (const cx of ALIGN[v]) {
      if ((cy === 6 && cx === 6) || (cy === 6 && cx === n - 7) || (cy === n - 7 && cx === 6)) continue;
      for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) { g[cy + y][cx + x] = Math.max(Math.abs(x), Math.abs(y)) !== 1; fx[cy + y][cx + x] = true; }
    }
    for (let i = 0; i < 9; i++) { fx[8][i] = true; fx[i][8] = true; }
    for (let i = 0; i < 8; i++) { fx[8][n - 1 - i] = true; fx[n - 1 - i][8] = true; }
    g[n - 8][8] = true; fx[n - 8][8] = true;
    if (v >= 7) for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) { fx[n - 11 + j][i] = true; fx[i][n - 11 + j] = true; }
    return [g, fx];
  }
  const MASKS = [(r, c) => (r + c) % 2 === 0, r => r % 2 === 0, (r, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0, (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => (r * c) % 2 + (r * c) % 3 === 0, (r, c) => ((r * c) % 2 + (r * c) % 3) % 2 === 0, (r, c) => ((r + c) % 2 + (r * c) % 3) % 2 === 0];
  function formatBits(l, m) {
    const v = (LVL[l] << 3) | m; let rest = v << 10;
    for (let i = 4; i >= 0; i--) if (rest & (1 << (i + 10))) rest ^= 0b10100110111 << i;
    const b = ((v << 10) | rest) ^ 0b101010000010010; return Array.from({ length: 15 }, (_, i) => (b >> (14 - i)) & 1);
  }
  function versionBits(v) {
    let rest = v << 12; for (let i = 5; i >= 0; i--) if (rest & (1 << (i + 12))) rest ^= 0b1111100100101 << i;
    const b = (v << 12) | rest; return Array.from({ length: 18 }, (_, i) => (b >> (17 - i)) & 1);
  }
  function penalty(g) {
    const n = g.length, cols = g[0].map((_, c) => g.map(r => r[c])); let s = 0;
    for (const L of [g, cols]) for (const row of L) { let run = 1; for (let i = 1; i < n; i++) { if (row[i] === row[i - 1]) run++; else { if (run >= 5) s += 3 + run - 5; run = 1; } } if (run >= 5) s += 3 + run - 5; }
    for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++) if (g[r][c] === g[r][c + 1] && g[r][c] === g[r + 1][c] && g[r][c] === g[r + 1][c + 1]) s += 3;
    const F = [true, false, true, true, true, false, true];
    for (const L of [g, cols]) for (const row of L) for (let i = 0; i < n - 6; i++) {
      if (!F.every((v, k) => row[i + k] === v)) continue;
      if (i >= 4 && !row.slice(i - 4, i).some(Boolean)) s += 40;
      if (i + 11 <= n && !row.slice(i + 7, i + 11).some(Boolean)) s += 40;
    }
    const dark = g.reduce((a, r) => a + r.filter(Boolean).length, 0);
    return s + 10 * Math.floor(Math.abs(dark * 100 / (n * n) - 50) / 5);
  }
  function writeFormat(g, l, m, v) {
    const n = g.length, b = formatBits(l, m);
    for (let i = 0; i < 6; i++) { g[8][i] = !!b[i]; g[n - 1 - i][8] = !!b[i]; }
    g[8][7] = !!b[6]; g[8][8] = !!b[7]; g[7][8] = !!b[8];
    for (let i = 9; i < 15; i++) { g[14 - i][8] = !!b[i]; g[8][n - 15 + i] = !!b[i]; }
    g[n - 8][8] = true;
    if (v >= 7) { const vb = versionBits(v); for (let i = 0; i < 18; i++) { const r = Math.floor(i / 3), c = i % 3; g[n - 11 + c][r] = !!vb[17 - i]; g[r][n - 11 + c] = !!vb[17 - i]; } }
  }
  function qrcode(text, level = 'M') {
    level = String(level).toUpperCase(); if (!(level in LVL)) level = 'M';
    const data = [...new TextEncoder().encode(String(text))];
    let v = 1; while (v <= 10 && capacity(v, level) < data.length) v++;
    if (v > 10) throw new Error(T('Donnée trop longue pour un QR Code ({n} octets, {m} au plus au niveau {l}).', { n: data.length, m: capacity(10, level), l: level }));
    const stream = bitstream(data, v, level), [g, fx] = skeleton(v), n = g.length;
    let idx = 0, col = n - 1, up = true;
    while (col > 0) {
      if (col === 6) col--;
      for (let k = 0; k < n; k++) { const row = up ? n - 1 - k : k; for (const c of [col, col - 1]) { if (fx[row][c]) continue; g[row][c] = idx < stream.length ? !!stream[idx] : false; idx++; } }
      up = !up; col -= 2;
    }
    let best = null, bs = Infinity;
    for (let m = 0; m < 8; m++) {
      const cand = g.map(r => r.slice());
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (!fx[r][c] && MASKS[m](r, c)) cand[r][c] = !cand[r][c];
      writeFormat(cand, level, m, v); const s = penalty(cand); if (s < bs) { best = cand; bs = s; }
    }
    return best;
  }
  /* ---------- Code 39 ---------- */
  const C39 = { '0': '000110100', '1': '100100001', '2': '001100001', '3': '101100000', '4': '000110001', '5': '100110000', '6': '001110000', '7': '000100101', '8': '100100100', '9': '001100100',
    A: '100001001', B: '001001001', C: '101001000', D: '000011001', E: '100011000', F: '001011000', G: '000001101', H: '100001100', I: '001001100', J: '000011100', K: '100000011',
    L: '001000011', M: '101000010', N: '000010011', O: '100010010', P: '001010010', Q: '000000111', R: '100000110', S: '001000110', T: '000010110', U: '110000001', V: '011000001',
    W: '111000000', X: '010010001', Y: '110010000', Z: '011010000', '-': '010000101', '.': '110000100', ' ': '011000100', '$': '010101000', '/': '010100010', '+': '010001010', '%': '000101010', '*': '010010100' };
  function code39(text, checksum) {
    text = String(text).toUpperCase();
    const bad = [...new Set([...text].filter(c => !(c in C39) || c === '*'))];
    if (bad.length) throw new Error(T('Caractère(s) hors Code 39 : {l}', { l: bad.join(', ') }));
    let body = text;
    if (checksum) { const al = Object.keys(C39).filter(k => k !== '*').join(''); body += al[[...text].reduce((s, c) => s + al.indexOf(c), 0) % 43]; }
    const bits = [];
    [...('*' + body + '*')].forEach((ch, i) => { if (i) bits.push(false); [...C39[ch]].forEach((w, j) => { for (let k = 0; k < (w === '1' ? 3 : 1); k++) bits.push(j % 2 === 0); }); });
    return [bits];
  }
  /* ---------- EAN-13 ---------- */
  const EAN_L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
  const EAN_P = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
  const eanR = d => [...EAN_L[d]].map(c => (c === '0' ? '1' : '0')).join(''), eanG = d => [...eanR(d)].reverse().join('');
  function ean13(digits) {
    digits = String(digits).replace(/\s/g, '');
    if (!/^\d{12,13}$/.test(digits)) throw new Error(T('EAN-13 : 12 ou 13 chiffres attendus.'));
    const v = [...digits.slice(0, 12)].map(Number), key = (10 - v.reduce((s, x, i) => s + x * (i % 2 ? 3 : 1), 0) % 10) % 10;
    if (digits.length === 13 && +digits[12] !== key) throw new Error(T('EAN-13 : clé de contrôle {a} au lieu de {b}.', { a: digits[12], b: key }));
    v.push(key);
    const bits = [true, false, true];
    [...EAN_P[v[0]]].forEach((p, i) => [...(p === 'L' ? EAN_L[v[i + 1]] : eanG(v[i + 1]))].forEach(c => bits.push(c === '1')));
    bits.push(false, true, false, true, false);
    v.slice(7).forEach(d => [...eanR(d)].forEach(c => bits.push(c === '1')));
    bits.push(true, false, true);
    return [bits];
  }
  /* ---------- Code 128 : sous-ensemble B, bascule en C pour les suites de chiffres ---------- */
  const C128 = ['212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222',
    '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321', '232121',
    '111323', '131123', '131321', '112313', '132113', '132311', '211313', '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
    '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224', '111422', '121124', '121421',
    '141122', '141221', '112214', '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', '111242', '121142', '121241', '114212',
    '124112', '124211', '411212', '421112', '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141', '114131',
    '311141', '411131', '211412', '211214', '211232', '2331112'];
  function code128codes(s) {
    const codes = []; let set = null, i = 0;
    const digitsAt = k => { let n = 0; while (k + n < s.length && s[k + n] >= '0' && s[k + n] <= '9') n++; return n; };
    while (i < s.length) {
      const d = digitsAt(i), wantC = d >= 4 || (d === s.length - i && d >= 2 && d % 2 === 0);
      if (wantC) {
        if (set !== 'C') { codes.push(set === null ? 105 : 99); set = 'C'; }
        const n = d - (d % 2); for (let k = 0; k < n; k += 2) codes.push(+s.slice(i + k, i + k + 2)); i += n;
      } else {
        if (set !== 'B') { codes.push(set === null ? 104 : 100); set = 'B'; }
        codes.push(s.charCodeAt(i) - 32); i++;
      }
    }
    if (!codes.length) codes.push(104);
    codes.push(codes.reduce((a, c, k) => a + c * (k || 1), 0) % 103, 106);
    return codes;
  }
  function code128(text) {
    const s = String(text);
    if ([...s].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) > 126)) throw new Error(T('Code 128 : caractères ASCII imprimables seulement.'));
    const bits = [];
    code128codes(s).forEach(c => [...C128[c]].forEach((w, j) => { for (let k = 0; k < +w; k++) bits.push(j % 2 === 0); }));
    return [bits];
  }
  const KINDS = [['qr', 'QR Code'], ['datamatrix', 'DataMatrix (ECC200)'], ['code128', 'Code 128'], ['code39', 'Code 39'], ['ean13', 'EAN-13']];
  const LINEAR = ['code39', 'ean13', 'code128'];
  function encode(kind, text, o = {}) {
    if (kind === 'datamatrix') return window.DataMatrix.encode(text, o.shape || 'square');
    if (kind === 'qr') return qrcode(text, o.level || 'M');
    if (kind === 'code39') return code39(text, !!o.checksum);
    if (kind === 'ean13') return ean13(text);
    if (kind === 'code128') return code128(text);
    throw new Error(T('Symbologie inconnue : {k}', { k: kind }));
  }
  window.Codes = { encode, qrcode, code39, ean13, code128, code128codes, KINDS, isLinear: k => LINEAR.includes(k) };
})();
