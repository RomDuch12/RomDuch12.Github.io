// Lecture des fichiers TypeEdit (.vnd, .gvt, .smb) : portage des lecteurs Python de VectorDrive.
// Sans fichier d'exemple : les tests sur échantillons restent hors du dépôt (tests/local, fichiers de clients).
// Valeurs attendues relevées avec le lecteur Python de VectorDrive-public (mêmes nombres d'objets, boîtes à 1e-6 mm).
import test from 'node:test';
import assert from 'node:assert/strict';
import { charger } from './charger.mjs';
const { VDTypeEdit: T } = charger('vd-te.js');
const proche = (a, b, e = 1e-6) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < e);
test('contours TypeEdit : droite, conique, Bézier cubique, contour fermé qui recommence au dernier nœud', () => {
  // points homogènes en mètres (x·w, y·w, z·w, w, drapeau) ; bit 0 = nœud
  const ouvert = [[0, 0, 0, 1, 1], [0.01, 0, 0, 1, 1], [0.01 * 0.5, 0.01 * 0.5, 0, 0.5, 0], [0, 0.01, 0, 1, 1],
    [0, 0.02, 0, 1, 0], [0.01, 0.02, 0, 1, 0], [0.01, 0.03, 0, 1, 1]];
  const s = T.segmentsContour(ouvert, false);
  assert.deepEqual(s.map(x => x[0]), ['L', 'Q', 'C']);
  assert.deepEqual(s[0], ['L', 0, 0, 10, 0]);
  assert.deepEqual(s[1], ['Q', 10, 0, 10, 10, 0, 10, 0.5]);
  assert.deepEqual(s[2], ['C', 0, 10, 0, 20, 10, 20, 10, 30]);
  const ferme = T.segmentsContour([[0.01, 0, 0, 1, 1], [0.01, 0.01, 0, 1, 1], [0, 0, 0, 1, 1]], true);
  assert.deepEqual(ferme, [['L', 0, 0, 10, 0], ['L', 10, 0, 10, 10], ['L', 10, 10, 0, 0]]);
  assert.deepEqual(T.segmentsContour([[0, 0, 0, 1, 0], [1, 1, 0, 1, 0]], true), []);
  // boîte exacte d'un quart de cercle en conique (w = cos 45°)
  assert.ok(proche(T.boiteSegment(['Q', 1, 0, 1, 1, 0, 1, Math.SQRT1_2]), [0, 0, 1, 1], 1e-12));
});

test('signatures inconnues refusées', () => {
  assert.throws(() => T.lireVND(new Uint8Array(8)), /trop court/);
  assert.throws(() => T.lireVND(new Uint8Array(64)), /pas un dessin TypeEdit/);
  assert.throws(() => T.lireSMB(new Uint8Array(64)), /pas un symbole TypeEdit/);
  assert.throws(() => T.lireSMB(new TextEncoder().encode('%PDF-1.4 ' + ' '.repeat(40))), /PDF/);
});

