/* Service worker di Schelp Studio (scope /studio/).
 * - Pagine: rete prima, poi copia locale (l'app si apre anche offline).
 * - Asset con hash (/studio/assets/*): cache permanente.
 * - Font Google: cache con aggiornamento in background.
 * - API e audio: mai intercettati (l'audio offline sta in IndexedDB). */
const VERSION = 'v1';
const SHELL = `shell-${VERSION}`;
const ASSETS = `assets-${VERSION}`;
const FONTS = `fonts-${VERSION}`;
const INDEX = '/studio/index.html';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.add(INDEX)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => ![SHELL, ASSETS, FONTS].includes(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (req.mode === 'navigate' && url.origin === self.location.origin) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) caches.open(SHELL).then((c) => c.put(INDEX, res.clone()));
          return res;
        })
        .catch(() => caches.match(INDEX).then((r) => r || Response.error())),
    );
    return;
  }

  if (url.origin === self.location.origin && url.pathname.startsWith('/studio/assets/')) {
    event.respondWith(
      caches.open(ASSETS).then((c) =>
        c.match(req).then(
          (hit) =>
            hit ||
            fetch(req).then((res) => {
              if (res.ok) c.put(req, res.clone());
              return res;
            }),
        ),
      ),
    );
    return;
  }

  if (url.origin === self.location.origin && /^\/studio\/(icon-\d+\.png|logo-schelp\.png|favicon\.png)$/.test(url.pathname)) {
    event.respondWith(caches.open(ASSETS).then((c) => c.match(req).then((hit) => hit || fetch(req).then((res) => (res.ok && c.put(req, res.clone()), res)))));
    return;
  }

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(FONTS).then((c) =>
        c.match(req).then((hit) => {
          const net = fetch(req)
            .then((res) => {
              if (res.ok || res.type === 'opaque') c.put(req, res.clone());
              return res;
            })
            .catch(() => hit);
          return hit || net;
        }),
      ),
    );
  }
});
