// VectorDrive web : formes, codes, perçage et programme ISO, exports en couleurs (sans réseau ;
// les booléens, décalages, contours et poches passent par Clipper, chargé dans le navigateur, et se vérifient dans la page).
import test from 'node:test';
import assert from 'node:assert/strict';
import { charger } from './charger.mjs';

const G = charger('codes.js', 'vdz.js', 'vd-web.js', 'vd-outils.js', 'vd-fao.js');
const { VDWeb: W, VDOutils: O, VDFao: F } = G;

test('polygone, étoile, arc, code QR', () => {
  assert.equal(W.polys(O.polygone(0, 0, 10, 6))[0].length, 7);
  assert.equal(W.polys(O.etoile(0, 0, 10, 4, 5))[0].length, 11);
  const a = W.boite([O.arc(0, 0, 10, 0, 180)]); assert.ok(Math.abs(a[0] + 10) < 1e-3 && Math.abs(a[3] - 10) < 1e-2);
  const q = O.code('qr', 'VectorDrive', 0, 0, 0.5); assert.ok(q.filled && q.path.length > 20);
  const b = W.boite([q]); assert.ok(Math.abs((b[2] - b[0]) - (b[3] - b[1])) < 1e-9);
});

test('perçage, gravure et programme ISO', async () => {
  let doc = W.nouveau(100, 50);
  doc.layers[0].items.push(W.ellipse(60, 20, 2, 2, 1), W.polyligne([[0, 0], [10, 0]], false, 2));
  const ops = [{ ...F.operationDefaut('percage', 1), profondeur: 3, passe: 1 }, { ...F.operationDefaut('gravure', 2), profondeur: 0.2, passe: 0.2 }];
  doc = F.avecReglages(doc, { ...F.reglages(doc), operations: ops });
  const res = await F.toutCalculer(doc);
  assert.deepEqual(res[0].chemins[0].pts[0].map(v => Math.round(v * 100) / 100), [60, 20]);
  assert.equal(res[1].chemins.length, 1); assert.equal(res[1].chemins[0].z, -0.2);
  assert.ok(res.every(r => r.minutes > 0));
  const g = F.gcode(doc, res);
  assert.match(g, /G21 G90 G17/); assert.match(g, /M30/); assert.match(g, /G1 Z-3 F200/); assert.match(g, /G1 X10 Y0 F600/);
  assert.deepEqual(F.niveaux({ profondeur: 1, passe: 0.4 }), [-0.4, -0.8, -1]);
});

test('exports : calques et couleurs gardés', () => {
  const doc = W.nouveau(50, 30); doc.layers[0].items.push(W.rectangle(0, 0, 10, 10, 0, 1)); doc.layers[0].name = 'Gravure';
  const d = O.dxf(doc); assert.match(d, /\nLAYER\r\n2\r\nGravure\r\n70\r\n0\r\n62\r\n1\r\n/); assert.match(d, /POLYLINE\r\n8\r\nGravure/);
  const s = O.svg(doc); assert.match(s, /inkscape:label="Gravure"/); assert.match(s, /stroke="#e53935"/);
  const p = O.pdf(doc); assert.match(p, /^%PDF-1\.4/); assert.match(p, /0\.898 0\.224 0\.208 RG/);
  assert.match(O.eps(doc), /setrgbcolor/);
});
