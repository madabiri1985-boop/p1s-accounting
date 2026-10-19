// Offline cache for the app files only (never for the GitHub data API). Bump VERSION when files change.
const VERSION = 'voxara-v3';
const FILES = ['./', './index.html', './app.css', './core.js', './sync.js', './pdf.js', './ui.js', './manifest.webmanifest',
  './fonts/Vazirmatn-Regular.ttf', './fonts/Vazirmatn-Bold.ttf', './icons/icon-192.png', './icons/icon-512.png', './icons/logo.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  // network first, so a new version shows up as soon as it is published; cache when offline
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(hit => hit || caches.match('./index.html'))));
});
