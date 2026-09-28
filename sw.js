/* Fonctionnement hors ligne (atelier sans réseau).
   Fichiers du site : réseau d'abord (toujours la dernière version), cache en secours.
   Bibliothèques et polices externes (CDN) : cache d'abord, elles ne changent pas pour une version donnée. */
const CACHE = 'romduch-v1';
const SITE = ['./', 'index.html', 'neodrive.html', 'taudrive.html', 'tauconvert.html', 'outils.html', 'coupe.html', 'cv.html', 'tuto.html',
  'themes.css', 'site.css', 'i18n.js', 'theme.js', 'ui.js', 'stockage.js', 'generateur.js', 'simpl-editeur.js', 'simpl-lecture.js', 'outils-format.js',
  'coupe.js', 'taudrive.js', 'vecteurs.js', 'codes.js', 'catalogue-datron.json', 'tools.json', 'tools-demo.json', 'NeoDrive.png',
  'icon-192.png', 'icon-512.png', 'manifest.webmanifest', 'lang/en.js', 'lang/de.js', 'lang/it.js', 'lang/es.js', 'lang/zh.js', 'lang/ru.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SITE.map(u => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    e.respondWith(fetch(req).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(k => k.put(req, c)); } return r; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
  } else if (/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|fonts\.(googleapis|gstatic)\.com/.test(url.host)) {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(n => { const c = n.clone(); caches.open(CACHE).then(k => k.put(req, c)); return n; })));
  }
});
