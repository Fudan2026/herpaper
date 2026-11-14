/* HerPaper service worker — standalone GitHub Pages / local server only.
 * Never registered inside the SuPro embed (those files are not in the sync set).
 * Strategy: app-shell precache + network-first for API / OpenAlex, cache-first for icons. */
'use strict';
const CACHE = 'herpaper-shell-v1';
const SHELL = [
  './',
  './index.html',
  './style.css',
  './core.js',
  './app.js',
  './integrations.js',
  './cloud-sync.js',
  './herpaper-i18n.js',
  './promo.html',
  './promo.css',
  './offline.html',
  './manifest.webmanifest',
  './assets/herpaper-icon-32.png',
  './assets/herpaper-icon-64.png',
  './assets/herpaper-icon-192.png',
  './assets/herpaper-icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Never cache cross-origin scholarly APIs — always hit the network.
  if (url.origin !== self.location.origin) return;

  const isShell = SHELL.some((p) => url.pathname.endsWith(p.replace(/^\.\//, '')) || url.pathname.endsWith('/'));
  if (isShell || url.pathname.endsWith('.css') || url.pathname.endsWith('.js') || url.pathname.endsWith('.png') || url.pathname.endsWith('.webmanifest')) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match('./offline.html')))
    );
    return;
  }
  event.respondWith(
    fetch(req).catch(() => caches.match(req).then((h) => h || caches.match('./offline.html')))
  );
});
