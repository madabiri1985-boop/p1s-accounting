// Offline cache for the app shell. Bump VERSION when files change.
const VERSION = 'p1s-v1';
const FILES = ['./', './index.html', './app.css', './core.js', './ui.js', './manifest.webmanifest',
  './fonts/Vazirmatn-Regular.ttf', './fonts/Vazirmatn-Bold.ttf', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
    const copy = res.clone();
    caches.open(VERSION).then(c => c.put(e.request, copy));
    return res;
  }).catch(() => caches.match('./index.html'))));
});
