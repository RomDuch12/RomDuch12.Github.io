// Formats tools.json (site et NeoDrive bureau) et cohérence des traductions.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { charger, lire } from './charger.mjs';

const { OutilsFormat } = charger('outils-format.js');

test('tools.json NeoDrive bureau : lu, puis réécrit dans le même format', () => {
  const bureau = { version: '1.0', tools: {
    cyl8: { name: 'Cyl 8', reference: '0068443G / 114206', type_taraudage: 'Cyl8', rpm: 30000, feed_roughing: 1500, geometry: { Diameter: 8, NumberOfFlutes: 1, FluteLength: 41 } },
    con30: { name: 'Con 30° 0.2', reference: '0068283D', type_taraudage: 'Con30', geometry: { Diameter: 6, TipAngle: 30, TipDiameter: 0.2 } },
    m6: { name: 'Thr M6', reference: 'x', type_taraudage: 'M6', geometry: {} } } };
  const site = OutilsFormat.normaliser(bureau);
  assert.deepEqual(site.tools.map(t => t.type), ['fraise', 'gravure', 'filetage']);
  assert.equal(site.tools[0].articleNr, '0068443G'); assert.equal(site.tools[0].feeds.roughing, 1500);
  assert.deepEqual(Object.values(OutilsFormat.versBureau(site).tools).map(t => t.type_taraudage), ['Cyl8', 'Con30', 'M6']);
  assert.throws(() => OutilsFormat.normaliser({ foo: 1 }), /tools/);
});

test('set de démarrage valide', () => {
  const j = JSON.parse(lire('tools-demo.json'));
  assert.ok(j.tools.length >= 20);
  for (const t of j.tools) { assert.ok(t.id && t.articleNr && t.diameter > 0 && t.rpm > 0 && t.feeds.roughing > 0, t.id); }
});

test('traductions : mêmes clés dans les 6 langues, variables {x} et balises conservées', () => {
  const D = {};
  for (const l of ['en', 'de', 'it', 'es', 'zh', 'ru']) vm.runInNewContext(lire(`lang/${l}.js`), { I18N: { add: (k, d) => { D[k] = d; } } });
  const ref = Object.keys(D.en).sort();
  const vars = s => (s.match(/\{\w+\}/g) || []).sort().join(), tags = s => (s.match(/<[a-z][^>]*>/gi) || []).length;
  for (const [l, d] of Object.entries(D)) {
    assert.deepEqual(Object.keys(d).sort(), ref, `clés ${l}`);
    for (const [k, v] of Object.entries(d)) { assert.equal(vars(v), vars(k), `${l} : ${k}`); assert.equal(tags(v), tags(k), `${l} : ${k}`); }
  }
});
