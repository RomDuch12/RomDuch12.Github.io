// Construit _ovh/ : le site de vectordrive.fr, c'est-à-dire l'onglet VectorDrive web seul (vectordrive.html devient index.html).
// Les liens vers les autres pages du site renvoient à romduch12.github.io. Utilisé par le workflow avant l'envoi FTP.
//   node .github/ovh.mjs
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const R = join(dirname(fileURLToPath(import.meta.url)), '..'), S = join(R, '_ovh');
const GH = 'https://romduch12.github.io/', FR = 'https://vectordrive.fr/';
const FICHIERS = ['site.css', 'themes.css', 'i18n.js', 'theme.js', 'ui.js', 'stockage.js', 'vecteurs.js', 'codes.js', 'vdz.js', 'vd-web.js', 'vd-outils.js',
  'vd-fao.js', 'vd-ia.js', 'vd-te.js', 'vue3d.js', 'sw.js', 'icon-192.png', 'icon-512.png', 'vectordrive.png', 'exemples/echecs-ia.vdz', '.htaccess', 'LICENSE', 'NOTICE.md'];
const PAGES = readdirSync(R).filter(f => f.endsWith('.html') && f !== 'vectordrive.html' && !f.startsWith('google'));

/* liens : autres pages -> github.io ; vectordrive.html -> racine */
const relier = s => {
  for (const p of PAGES) s = s.split(`href="${p}`).join(`href="${GH}${p}`).split(`href=\\"${p}`).join(`href=\\"${GH}${p}`);
  return s.split('href="vectordrive.html"').join('href="./"').split('href=\\"vectordrive.html\\"').join('href=\\"./\\"');
};

rmSync(S, { recursive: true, force: true });
mkdirSync(join(S, 'lang'), { recursive: true }); mkdirSync(join(S, 'exemples'), { recursive: true });
for (const f of FICHIERS) copyFileSync(join(R, f), join(S, f));
for (const f of readdirSync(join(R, 'lang'))) writeFileSync(join(S, 'lang', f), relier(readFileSync(join(R, 'lang', f), 'utf8')));

let html = relier(readFileSync(join(R, 'vectordrive.html'), 'utf8'));
html = html.replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${FR}">`);
if (!html.includes('rel="canonical"')) throw new Error('canonical absent de vectordrive.html');
writeFileSync(join(S, 'index.html'), html);

writeFileSync(join(S, 'manifest.webmanifest'), JSON.stringify({
  name: 'VectorDrive web', short_name: 'VectorDrive', description: 'Dessin, textes, booléens, parcours d\'outil et assistant IA, dans le navigateur.',
  lang: 'fr', start_url: './', scope: './', display: 'standalone', background_color: '#171b22', theme_color: '#171b22',
  icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }]
}, null, 2) + '\n');
writeFileSync(join(S, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${FR}sitemap.xml\n`);
writeFileSync(join(S, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${FR}</loc><lastmod>${new Date().toISOString().slice(0, 10)}</lastmod></url>\n</urlset>\n`);

/* contrôle : aucun lien relatif vers une page absente */
const reste = [...html.matchAll(/href="([^"#:]+\.html)/g)].map(m => m[1]).filter(f => !existsSync(join(S, f)));
if (reste.length) throw new Error('liens cassés : ' + reste.join(', '));
console.log(`_ovh : ${readdirSync(S).length} entrées`);
