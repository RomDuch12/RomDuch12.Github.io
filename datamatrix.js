/* DataMatrix ECC200 (ISO/IEC 16022), carré et rectangulaire – porté de TauDrive (engrave/barcode.py).
   DataMatrix.encode(texte, 'square' | 'rect' | 'auto') → matrice de booléens [ligne][colonne], ligne 0 en haut. */
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
