// Volumes d'un dessin VectorDrive (.vdz) : zip, npz, crédits de l'assistant IA.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { charger, RACINE } from './charger.mjs';

const { VDZ } = charger('vdz.js');

test('exemple jeu d\'échecs : 47 volumes, triangles valides, crédits IA', async () => {
  const s = await VDZ.lire(readFileSync(join(RACINE, 'exemples', 'echecs-ia.vdz')));
  assert.equal(s.meshes.length, 47);
  assert.ok(s.meshes.some(m => m.name === 'Echiquier'));
  for (const m of s.meshes) {
    const nv = m.pos.length / 3;
    assert.ok(m.index.length % 3 === 0 && m.index.every(i => i < nv), m.name);
    assert.equal(m.faces[0].last, m.index.length / 3 - 1);
  }
  assert.deepEqual(s.bounds.map(Math.round), [-112, -112, 0, 112, 112, 43]);
  assert.equal(s.credits.tours, 21);
  assert.ok(Math.abs(s.credits.cout - 1.92) < 0.01);
});
