// Lecture / écriture de dessins et décalage de contours.
import test from 'node:test';
import assert from 'node:assert/strict';
import { charger } from './charger.mjs';

const { Vecteurs: V } = charger('vecteurs.js');
const carre = [[0, 0], [40, 0], [40, 20], [0, 20], [0, 0]];
const proche = (a, b, e = 1e-3) => Math.abs(a - b) < e;

test('DXF : aller-retour exact, contours fermés', () => {
  const r = V.readDXF(V.toDXF([carre, V.circle(6, 20, 10)]));
  const p = V.join(r.items.map(i => i.poly)), b = V.bounds(p);
  assert.equal(p.length, 2); assert.equal(p.filter(V.closed).length, 2);
  assert.ok(proche(b[2] - b[0], 40) && proche(b[3] - b[1], 20));
});

test('DXF : arc de polyligne (bulge) et calque éteint écarté', () => {
  const dxf = ['0', 'SECTION', '2', 'TABLES', '0', 'LAYER', '2', 'OFF', '62', '-7', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES',
    '0', 'LWPOLYLINE', '8', 'A', '70', '1', '10', '0', '20', '0', '42', '1', '10', '10', '20', '0', '42', '1',
    '0', 'CIRCLE', '8', 'OFF', '10', '50', '20', '50', '40', '5', '0', 'ENDSEC', '0', 'EOF'].join('\n');
  const r = V.readDXF(dxf), b = V.bounds([r.items[0].poly]);
  assert.equal(r.items.length, 1);
  assert.ok(proche(b[2] - b[0], 10, 1e-2) && proche(b[3] - b[1], 10, 1e-2), 'cercle Ø10 par deux demi-arcs');
});

test('EPS : aller-retour', () => {
  const r = V.readEPS(new TextEncoder().encode(V.toEPS([carre])).buffer), b = V.bounds(r.items.map(i => i.poly));
  assert.ok(proche(b[2] - b[0], 40, 1e-2) && proche(b[3] - b[1], 20, 1e-2));
});

test('PDF : trait le plus fin (largeur 0)', () => {
  assert.match(V.toPDF([carre]), /\n0 w /);
});

test('raccord des segments en contour fermé', () => {
  const segs = [[[0, 0], [10, 0]], [[10, 10], [10, 0]], [[10, 10], [0, 10]], [[0, 0], [0, 10]]];
  const p = V.join(segs); assert.equal(p.length, 1); assert.ok(V.closed(p[0]));
});

test('offset exact : carré 20 mm ± 0,5 et contre-forme', () => {
  const sq = [[0, 0], [20, 0], [20, 20], [0, 20], [0, 0]], trou = [[5, 5], [15, 5], [15, 15], [5, 15], [5, 5]];
  const o = V.bounds(V.offsetContours([sq], 0.5)); assert.deepEqual(o.map(v => +v.toFixed(4)), [-0.5, -0.5, 20.5, 20.5]);
  const i = V.bounds(V.offsetContours([sq], -0.5)); assert.deepEqual(i.map(v => +v.toFixed(4)), [0.5, 0.5, 19.5, 19.5]);
  const t = V.offsetContours([sq, trou], 0.5); const bt = V.bounds([t[1]]);
  assert.deepEqual(bt.map(v => +v.toFixed(4)), [5.5, 5.5, 14.5, 14.5], 'la contre-forme se referme quand la matière grossit');
});
