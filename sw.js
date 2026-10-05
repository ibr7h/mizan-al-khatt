const CACHE = 'mizan-al-khatt-v0.5.1';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app-v5.js',
  './manifest.webmanifest',
  './version.json',
  './data/alif.json',
  './data/baa.json',
  './data/taa.json',
  './data/thaa.json',
  './assets/vector/baa-family-analysis.svg',
  './assets/vector/baa-family-body.svg',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const isCore = url.origin === self.location.origin &&
    (url.pathname.endsWith('/index.html') ||
     url.pathname.endsWith('/app-v5.js') ||
     url.pathname.endsWith('/styles.css') ||
     url.pathname.includes('/data/'));

  if (isCore) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request).then(hit => hit || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(hit => hit || fetch(event.request).then(response => {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match('./index.html')))
  );
});