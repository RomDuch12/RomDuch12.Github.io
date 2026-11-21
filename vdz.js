/* Lecture des volumes d'un dessin VectorDrive (.vdz) : archive zip, document.json, et pour chaque objet 3D
   son maillage (npz de numpy : v = sommets float64, t = triangles int32), au format de Vecteurs.readSTEP3D.
   Rend aussi les crédits de l'assistant IA gardés dans le dessin. */
(function () {
  'use strict';
  const tr = (s, v) => (window.t ? window.t(s, v) : s);
  const dec = new TextDecoder();

  /* zip : répertoire central (zip64 compris), entrées stockées ou deflate */
  async function dezip(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let e = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error(tr('Archive zip illisible.'));
    let n = dv.getUint16(e + 10, true), cd = dv.getUint32(e + 16, true);
    if (cd === 0xffffffff || n === 0xffff) {                                 // fin de répertoire zip64
      const l = e - 20;
      if (l >= 0 && dv.getUint32(l, true) === 0x07064b50) { const z = Number(dv.getBigUint64(l + 8, true)); n = Number(dv.getBigUint64(z + 32, true)); cd = Number(dv.getBigUint64(z + 48, true)); }
    }
    const fichiers = {};
    for (let k = 0, p = cd; k < n; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error(tr('Archive zip illisible.'));
      const meth = dv.getUint16(p + 10, true), ln = dv.getUint16(p + 28, true), lx = dv.getUint16(p + 30, true), lc = dv.getUint16(p + 32, true);
      let taille = dv.getUint32(p + 20, true), brut = dv.getUint32(p + 24, true), off = dv.getUint32(p + 42, true);
      const nom = dec.decode(u8.subarray(p + 46, p + 46 + ln));
      for (let x = p + 46 + ln, fx = x + lx; x + 4 <= fx;) {                // champ zip64 : seules les valeurs saturées y sont
        const id = dv.getUint16(x, true), sz = dv.getUint16(x + 2, true);
        if (id === 1) { let q = x + 4; if (brut === 0xffffffff) { brut = Number(dv.getBigUint64(q, true)); q += 8; } if (taille === 0xffffffff) { taille = Number(dv.getBigUint64(q, true)); q += 8; } if (off === 0xffffffff) off = Number(dv.getBigUint64(q, true)); }
        x += 4 + sz;
      }
      const deb = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true), data = u8.subarray(deb, deb + taille);
      fichiers[nom] = meth === 0 ? Promise.resolve(data) : meth === 8 ? gonfler(data) : Promise.reject(new Error(tr('Compression zip non prise en charge.')));
      p += 46 + ln + lx + lc;
    }
    return fichiers;
  }
  const gonfler = u8 => new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer().then(b => new Uint8Array(b));

  /* tableau .npy (petit-boutiste, ordre C) */
  function npy(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), maj = u8[6];
    const lh = maj >= 2 ? dv.getUint32(8, true) : dv.getUint16(8, true), d0 = (maj >= 2 ? 12 : 10), h = dec.decode(u8.subarray(d0, d0 + lh));
    const type = (h.match(/'descr':\s*'([^']+)'/) || [])[1], forme = ((h.match(/'shape':\s*\(([^)]*)\)/) || [])[1] || '').split(',').filter(s => s.trim()).map(Number);
    if (/True/.test((h.match(/'fortran_order':\s*(\w+)/) || [])[1] || '')) throw new Error('npy fortran');
    const n = forme.reduce((a, b) => a * b, 1), deb = d0 + lh, src = u8.slice(deb, deb + n * parseInt(type.slice(2), 10)).buffer;
    const C = { '<f8': Float64Array, '<f4': Float32Array, '<i4': Int32Array, '<u4': Uint32Array, '<i8': BigInt64Array, '<i2': Int16Array, '<u2': Uint16Array }[type];
    if (!C) throw new Error('npy ' + type);
    return { data: new C(src), forme };
  }
  const b64 = s => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };

  /* volumes d'un document déjà lu (document.json) */
  async function volumes(doc) {
    const meshes = [];
    const parcourir = async items => { for (const it of items || []) {
      if (it.kind === 'group') await parcourir(it.children);
      let s = it.extra && it.extra.solide; if (!s) continue;
      if (typeof s === 'string') s = JSON.parse(s);
      if (!s.mesh || s.visible === false || it.visible === false) continue;
      const a = await dezip(b64(s.mesh)), v = npy(await a['v.npy']), t = npy(await a['t.npy']);
      const pos = Float32Array.from(v.data), m = s.m;
      if (Array.isArray(m) && m.length === 16 && m.some((x, i) => x !== (i % 5 === 0 ? 1 : 0)))   // matrice 4×4 par lignes
        for (let i = 0; i < pos.length; i += 3) { const [x, y, w] = [pos[i], pos[i + 1], pos[i + 2]]; pos[i] = m[0] * x + m[1] * y + m[2] * w + m[3]; pos[i + 1] = m[4] * x + m[5] * y + m[6] * w + m[7]; pos[i + 2] = m[8] * x + m[9] * y + m[10] * w + m[11]; }
      const index = Uint32Array.from(t.data, Number);
      meshes.push({ name: s.name || it.name || '', color: s.color || null, pos, normal: null, index, faces: [{ first: 0, last: index.length / 3 - 1, color: null }], id: it.id });
    } };
    for (const calque of doc.layers || []) if (calque.visible !== false) await parcourir(calque.items);
    const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const mm of meshes) for (let i = 0; i < mm.pos.length; i += 3) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], mm.pos[i + k]); b[k + 3] = Math.max(b[k + 3], mm.pos[i + k]); }
    return { meshes, bounds: b, credits: (doc.extra && doc.extra.ia_credits) || null };
  }
  async function lire(buffer) {
    const z = await dezip(new Uint8Array(buffer));
    if (!z['document.json']) throw new Error(tr('Ce fichier n\'est pas un dessin VectorDrive (.vdz).'));
    const r = await volumes(JSON.parse(dec.decode(await z['document.json'])));
    if (!r.meshes.length) throw new Error(tr('Ce dessin VectorDrive ne contient aucun volume 3D.'));
    return r;
  }
  window.VDZ = { lire, volumes, dezip, npy };
})();
