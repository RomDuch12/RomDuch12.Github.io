// Codes 2D et linéaires : comparaison bit à bit avec les références (TauDrive barcode.py, python-barcode pour le Code 128).
import test from 'node:test';
import assert from 'node:assert/strict';
import { charger, fixture } from './charger.mjs';

const { Codes, DataMatrix } = charger('codes.js');
const bits = m => m.map(r => r.map(v => (v ? 1 : 0)).join('')).join('');

test('DataMatrix ECC200 identique à barcode.py', () => {
  for (const [cle, lignes] of Object.entries(fixture('datamatrix.json'))) {
    const [texte, forme] = cle.split('|');
    assert.deepEqual(DataMatrix.encode(texte, forme).map(r => r.map(v => (v ? 1 : 0)).join('')), lignes, cle);
  }
});

test('QR Code, Code 39, EAN-13, Code 128 identiques aux références', () => {
  for (const [cle, attendu] of Object.entries(fixture('codes.json'))) {
    const [type, texte, niveau] = cle.split('|');
    const m = type === 'qr' ? Codes.qrcode(texte, niveau) : type === 'c39' ? Codes.code39(texte, true) : type === 'ean' ? Codes.ean13(texte) : Codes.code128(texte);
    assert.equal(bits(m), attendu, cle);
  }
});

test('erreurs explicites plutôt que codes faux', () => {
  assert.throws(() => Codes.ean13('12345'), /EAN-13/);
  assert.throws(() => Codes.ean13('4006381333932'), /clé de contrôle/);
  assert.throws(() => Codes.code39('a:b'), /Code 39/);
  assert.throws(() => Codes.qrcode('x'.repeat(400), 'H'), /QR/);
});
