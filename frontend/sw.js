const CACHE_NAME = 'javin-fileshare-v1';
const STATIC_ASSETS = [
  '/',
  '/host.html',
  '/join-pin.html',
  '/session.html',
  '/send-files.html',
  '/receive-files.html',
  '/session-ended.html',
  '/assets/css/main.css',
  '/assets/js/core/index.js',
  '/assets/js/core/storage.js',
  '/assets/js/core/format.js',
  '/assets/js/core/url.js',
  '/assets/js/core/dom.js',
  '/assets/js/core/validation.js',
  '/assets/js/core/device.js',
  '/assets/js/core/errors.js',
  '/assets/js/socket/client.js',
  '/assets/js/pages/host.js',
  '/assets/js/pages/join-pin.js',
  '/assets/js/pages/session.js',
  '/assets/js/pages/send-files.js',
  '/assets/js/pages/receive-files.js'
];

// Install Event - Pre-cache shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching static assets');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate Event - Clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Removing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event - Network-First with Cache Fallback
self.addEventListener('fetch', (event) => {
  // Ignore Socket.IO packets, API calls, or non-GET requests
  if (
    event.request.method !== 'GET' ||
    event.request.url.includes('/socket.io') ||
    event.request.url.includes('/api/v1/') ||
    event.request.url.includes('/upload') ||
    event.request.url.includes('/download')
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Cache new/updated response dynamically
        if (networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Retrieve from cache if network fails
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // If fallback fails and requesting html page, return join page
          if (event.request.headers.get('accept').includes('text/html')) {
            return caches.match('/join-pin.html');
          }
        });
      })
  );
});
