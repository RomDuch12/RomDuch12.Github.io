// Construit _ovh/ : le site de vectordrive.fr. Tout le site (mêmes onglets que romduch12.github.io), la navigation reste sur vectordrive.fr ;
// la racine https://vectordrive.fr/ ouvre VectorDrive web (DirectoryIndex dans .htaccess), l'accueil reste index.html.
// Utilisé par le workflow avant l'envoi FTP.
//   node .github/ovh.mjs
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const R = join(dirname(fileURLToPath(import.meta.url)), '..'), S = join(R, '_ovh');
const FR = 'https://vectordrive.fr/';

/* fichiers suivis par git, hors programmes, tests, CI et fichier de vérification Google (propre à github.io) */
const HORS = /^(Programmes\/|tests\/|\.github\/|\.gitignore$|google[0-9a-f]+\.html$)/;
const FICHIERS = execFileSync('git', ['ls-files', '-z'], { cwd: R, encoding: 'utf8' }).split('\0').filter(f => f && !HORS.test(f));

rmSync(S, { recursive: true, force: true });
for (const f of FICHIERS) { mkdirSync(dirname(join(S, f)), { recursive: true }); copyFileSync(join(R, f), join(S, f)); }

/* canonical : chaque page -> son adresse vectordrive.fr (racine = VectorDrive web) ; github.io porte les mêmes balises */
const PAGES = FICHIERS.filter(f => f.endsWith('.html') && !f.includes('/'));
for (const p of PAGES) {
  let html = readFileSync(join(S, p), 'utf8');
  const url = p === 'vectordrive.html' ? FR : FR + (p === 'tauconvert.html' ? 'vdconvert.html' : p);
  const lien = `<link rel="canonical" href="${url}">`;
  html = /<link rel="canonical" href="[^"]*">/.test(html) ? html.replace(/<link rel="canonical" href="[^"]*">/, lien) : html.replace('</head>', `  ${lien}\n</head>`);
  if (!html.includes(lien)) throw new Error('canonical non posé : ' + p);
  writeFileSync(join(S, p), html);
}

/* racine = VectorDrive web */
const ht = join(S, '.htaccess');
writeFileSync(ht, readFileSync(ht, 'utf8').replace('Options -Indexes', 'Options -Indexes\nDirectoryIndex vectordrive.html index.html'));
/* robots.txt et sitemap.xml du dépôt pointent déjà vers vectordrive.fr (toutes les pages) */
if (!readFileSync(join(S, 'sitemap.xml'), 'utf8').includes(FR + 'index.html')) throw new Error('sitemap.xml : adresses vectordrive.fr attendues');
if (!readFileSync(join(S, 'robots.txt'), 'utf8').includes(FR + 'sitemap.xml')) throw new Error('robots.txt : sitemap vectordrive.fr attendu');

/* contrôle : aucun lien relatif vers un fichier absent */
const casses = [];
for (const p of PAGES) for (const m of readFileSync(join(S, p), 'utf8').matchAll(/(?:href|src)="([^"#?]*)/g))
  if (m[1] && !/^[a-z]+:|^\/\/|\$\{/.test(m[1]) && !existsSync(join(S, m[1]))) casses.push(`${p} -> ${m[1]}`);
if (casses.length) throw new Error('liens cassés : ' + casses.join(', '));
console.log(`_ovh : ${FICHIERS.length} fichiers, ${PAGES.length} pages`);
