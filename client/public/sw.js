/* Race Rush service worker.
 * - App shell: network-first (always fresh when online), cached copy offline.
 * - Hashed build assets, fonts, icons: cache-first (immutable).
 * - Never cached: /api/* (accounts, rewards) and /ws (realtime) — dynamic multiplayer data stays live.
 */
const VERSION = 'rr-v3-php-routing';
const SHELL = `${VERSION}-shell`;
const STATIC = `${VERSION}-static`;
const SHELL_URLS = ['./', './manifest.webmanifest', './fonts/fonts.css', './fonts/RussoOne-400.woff2', './fonts/Rajdhani-600.woff2', './fonts/Rajdhani-700.woff2', './app-icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_URLS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/api/') || url.pathname.includes('/ws')) return; // live data only

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put(copy));
          return res;
        })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }

  if (/\/(assets|fonts|app-icons)\//.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});
