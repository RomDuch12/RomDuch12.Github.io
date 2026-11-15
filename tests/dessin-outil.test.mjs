// Dessin d'outil : cotes, profil de révolution, STEP AP214 et DXF.
import test from 'node:test';
import assert from 'node:assert/strict';
import { charger } from './charger.mjs';

const { DessinOutil: D, Vecteurs: V } = charger('dessin-outil.js', 'vecteurs.js');

test('cotes : pointe à graver lue dans le catalogue (D1 = pointe, D2 = queue), défauts d\'atelier', () => {
  const e = { ref: '0068282G', categorie: 'conique', famille: 'Pointe à graver', D1: 0.1, D2: 6, L1: 50, angle: 30 };
  const c = D.cotes({ name: 'Con 30° 0.1', type: 'gravure', articleNr: '0068282G' }, e);
  assert.equal(c.famille, 'conique'); assert.ok(c.gravure);
  assert.equal(c.D1, 0.1); assert.equal(c.D2, 6); assert.equal(c.L1, 50); assert.equal(c.angle, 30);
  const f = D.cotes({ name: 'Cyl 3 z1L10', type: 'fraise' });
  assert.equal(f.D1, 3); assert.equal(f.L3, 10); assert.equal(f.dents, 1); assert.equal(f.D2, 6);
  assert.ok(f.L1 >= 40 && f.L2 > 0);
});

test('profil : de la pointe (z = 0) à la queue, z jamais décroissant, limite de coupe en sommet', () => {
  for (const type of ['fraise', 'surfacage', 'torique', 'boule', 'gravure', 'foret', 'filetage', 'chanfrein', 'rayon']) {
    const c = D.cotes({ type, diameter: 6, tipDiameter: type === 'gravure' ? 0.2 : undefined, tipAngle: type === 'gravure' ? 30 : 0, radius: 1, fluteLength: 8 });
    const { points: p, zCoupe } = D.profil(c);
    assert.equal(p[0][1], 0, type);
    for (let i = 1; i < p.length; i++) assert.ok(p[i][1] >= p[i - 1][1] - 1e-12, `${type} : z décroissant`);
    assert.ok(p.every(([r]) => r >= D.EPS_POINTE - 1e-12), type);
    assert.ok(p.some(([, z]) => Math.abs(z - zCoupe) < 1e-9), `${type} : sommet à la limite de coupe`);
  }
});

test('STEP : entités toutes définies, aucune instance en ligne, une face par segment + 2 disques', () => {
  const d = D.dessiner({ name: 'Cyl 8 z1L14', type: 'fraise', diameter: 8, fluteLength: 14, articleNr: '0068080E' }), s = d.step('2026-01-01T00:00:00Z');
  assert.match(s, /^ISO-10303-21;/); assert.match(s, /END-ISO-10303-21;\s*$/);
  const def = new Set([...s.matchAll(/^#(\d+)=/gm)].map(m => m[1])), refs = [...s.matchAll(/#(\d+)(?!=)/g)].map(m => m[1]);
  assert.ok(refs.every(r => def.has(r)), 'référence indéfinie');
  assert.doesNotMatch(s, /\(\s*VECTOR\(|,VECTOR\(/, 'VECTOR doit être une entité');
  const faces = (s.match(/ADVANCED_FACE\(/g) || []).length;
  assert.equal(faces, d.profil.points.length - 1 + 2);
  assert.equal((s.match(/STYLED_ITEM\(/g) || []).length, faces);
});

test('DXF : relu par le lecteur du site, silhouette à la bonne taille', () => {
  const d = D.dessiner({ name: 'Foret 4.2', type: 'foret', diameter: 4.2, fluteLength: 21 });
  const r = V.readDXF(d.dxf()), contour = r.items.filter(i => i.layer === 'CONTOUR').map(i => i.poly);
  assert.equal(contour.length, 1);
  const b = V.bounds(contour);
  assert.ok(Math.abs(b[2] - b[0] - 6) < 1e-6, 'largeur = Ø queue 6');
  assert.ok(Math.abs(b[3] - b[1] - d.cotes.L1) < 1e-6, 'hauteur = L1');
  assert.ok(!r.items.some(i => i.layer === 'PROFIL'), 'calque PROFIL éteint');
  assert.match(d.svg(), /^<svg[\s\S]*<\/svg>$/);
});
