// Lecteur SimPL du visualiseur : ordre d'exécution, ShiftWcsInc, outils et temps estimé.
import test from 'node:test';
import assert from 'node:assert/strict';
import { charger } from './charger.mjs';

const { SimplLecture } = charger('simpl-lecture.js');
const PROG = `module Test
@ ToolDescription : "Name":"Cyl 3", "ArticleNr":"0068030E", "Diameter":3 @
export program Main
    Absolute
    Carre
    ShiftWcsInc X=60
    Carre
endprogram
program Carre
    Tool type="0068030E"  skipRestoring
    SetFeedTechnology (roughing=600 plunge=100)
    Rapid X=0 Y=0 Z=5
    Feed Plunge
    Line Z=-1
    Feed Roughing
    Line X=10
    Line Y=10
    Line X=0
    Line Y=0
    Rapid Z=5
endprogram
`;

test('suit Main puis les programmes appelés, décalage ShiftWcsInc appliqué', () => {
  const r = SimplLecture.parse(PROG), xs = r.pts.map(p => p.x);
  assert.equal(Math.min(...xs), 0); assert.equal(Math.max(...xs), 70);
  assert.deepEqual(r.origins.map(o => [o.x, o.y]), [[60, 0]]);
  assert.equal(r.zmin, -1);
});

test('diamètre d\'outil et temps d\'usinage estimé', () => {
  const r = SimplLecture.parse(PROG);
  assert.ok(r.pts.filter(p => !p.rapid).every(p => p.d === 3));
  // par carré : plongée de Z5 à Z-1 (6 mm) à 100 mm/min + 40 mm à 600 mm/min = 3,6 s + 4 s ; deux carrés
  assert.ok(Math.abs(r.timeCut - 2 * (6 / 100 * 60 + 40 / 600 * 60)) < 1e-6, r.timeCut);
  assert.ok(r.feedKnown);
});

test('fichier sans Main : lecture ligne à ligne', () => {
  const r = SimplLecture.parse('X=0 Y=0 Z=5\nZ=-1\nX=10\nZ=5');
  assert.equal(r.pts.length, 4); assert.equal(r.cut, 16);            // plongée 6 mm + 10 mm ; la remontée est un rapide
});
