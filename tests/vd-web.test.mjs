// VectorDrive web : tracés, transformations, formes, écriture .vdz relue par le lecteur du site.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { charger, RACINE } from './charger.mjs';

const { VDWeb: W, VDZ } = charger('vdz.js', 'vd-web.js');
const proche = (a, b, e = 1e-6) => a.every((v, i) => Math.abs(v - b[i]) < e);

test('formes : rectangle arrondi, ellipse, boîte et distance', () => {
  const r = W.rectangle(0, 0, 40, 20, 5), e = W.ellipse(10, 10, 5, 3);
  assert.ok(proche(W.boite([r]), [0, 0, 40, 20], 1e-3));
  assert.ok(proche(W.boite([e]), [5, 7, 15, 13], 1e-3));
  assert.ok(W.distance(r, 20, 0.5) < 0.51 && W.distance(r, 20, 10) > 9);
  assert.equal(W.distance({ ...r, filled: true }, 20, 10), 0);
});

test('transformations : translation, rotation et échelle des tracés et des textes', () => {
  const r = W.rectangle(0, 0, 10, 10);
  assert.ok(proche(W.boite([W.transformer(r, W.translation(5, -2))]), [5, -2, 15, 8]));
  assert.ok(proche(W.boite([W.transformer(r, W.rotation(90, 0, 0))]), [-10, 0, 0, 10]));
  assert.ok(proche(W.boite([W.transformer(r, W.echelle(2, 3, 0, 0))]), [0, 0, 20, 30]));
  const t = { id: 'x', kind: 'text', text: 'A', matrix: [1, 0, 0, 1, 1, 1], outline: r.path, extra: {} };
  assert.deepEqual(W.transformer(t, W.translation(2, 0)).matrix, [1, 0, 0, 1, 3, 1]);
  assert.notEqual(W.copie(r).id, r.id);
});

test('.vdz : le jeu d\'échecs relu, déplacé, réécrit puis relu (volumes compris)', async () => {
  const buf = readFileSync(join(RACINE, 'exemples', 'echecs-ia.vdz'));
  const doc = await W.lireVDZ(buf);
  assert.equal(doc.layers[0].items.length, 53);
  const L = doc.layers[0], dep = { ...doc, layers: [{ ...L, items: L.items.map(it => W.transformer(it, W.translation(100, 0))) }] };
  const out = await W.versVDZ(dep);
  const f = join(tmpdir(), 'vd-web-test.vdz'); writeFileSync(f, out);
  const s = await VDZ.lire(out);
  assert.equal(s.meshes.length, 47);
  assert.ok(Math.abs(s.bounds[0] - -12) < 1e-3 && Math.abs(s.bounds[3] - 212) < 1e-3);
  assert.equal(s.credits.tours, 21);
  const relu = await W.lireVDZ(out);
  assert.equal(relu.extra.ia_credits.tours, 21);
});
