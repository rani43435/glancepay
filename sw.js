// Keeps the app shell on the device so repeat launches open instantly,
// even on a slow link. Pages: network first (to pick up updates), falling
// back to the cache. Versioned files (?v=…), icons and jsQR: cache first.
const CACHE = 'glancepay-v8';
const SHELL = [
  './',
  'index.html',
  'style.css?v=20261003-7',
  'app.js?v=20261003-7',
  'qr-worker.js?v=20261003-7',
  'icons/favicon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isPage = req.mode === 'navigate';
  const cacheFirst = url.search.includes('v=') || url.pathname.includes('/icons/') || url.hostname === 'cdn.jsdelivr.net';

  if (isPage) {
    e.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('index.html')))
    );
  } else if (cacheFirst) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      }))
    );
  }
});
