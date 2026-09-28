// Charge les scripts du site (écrits pour le navigateur) dans Node : window = globalThis.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

export const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
globalThis.window = globalThis;
export function charger(...fichiers) {
  for (const f of fichiers) vm.runInThisContext(readFileSync(join(RACINE, f), 'utf8'), { filename: f });
  return globalThis;
}
export const fixture = nom => JSON.parse(readFileSync(join(RACINE, 'tests', 'fixtures', nom), 'utf8'));
export const lire = f => readFileSync(join(RACINE, f), 'utf8');
