const CACHE = 'kasisougu-shell-v28';
const FILES = ['/', '/static/style.css', '/static/s03-s04.css', '/static/f04-f05.css', '/static/redesign.css', '/static/app.js', '/static/catalog.js', '/static/records.js', '/static/consultation.js', '/static/nearby-search.js', '/static/manifest.webmanifest', '/static/brand-logo.png', '/static/icon-192.png', '/static/icon-512.png'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('kasisougu-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // Never cache authenticated records, credentials, or API responses.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !FILES.includes(url.pathname)) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) { const clone = response.clone(); event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, clone))); }
    return response;
  }).catch(() => caches.match(event.request)));
});
