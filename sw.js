const CACHE_NAME = "apexstaff-v14";
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/data.js",
  "./js/dom.js",
  "./js/app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

// 1. Install event: Cache core assets
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[Service Worker] Caching core assets...");
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// 2. Activate event: Clean up old caches
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log("[Service Worker] Deleting old cache:", key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Fetch event: Cache-first with network fallback for assets, network-first for external APIs
self.addEventListener("fetch", (e) => {
  // Ignore non-GET requests (e.g. Google Sync POST request)
  if (e.request.method !== "GET") return;

  const url = new URL(e.request.url);

  // If it's a local asset or Google Font, use cache-first strategy
  const isLocalAsset = url.origin === self.location.origin;
  const isGoogleFont = url.host.includes("fonts.googleapis.com") || url.host.includes("fonts.gstatic.com");

  if (isLocalAsset || isGoogleFont) {
    e.respondWith(
      caches.match(e.request).then((cachedResponse) => {
        if (cachedResponse) {
          // Fetch updated version in the background (stale-while-revalidate style)
          fetch(e.request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(e.request, networkResponse);
              });
            }
          }).catch(() => {/* Ignore network check failure offline */});
          return cachedResponse;
        }

        return fetch(e.request).then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200) {
            return networkResponse;
          }
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseToCache);
          });
          return networkResponse;
        });
      })
    );
  } else {
    // Network-first for other external fetches (like sheets testing/doGet)
    e.respondWith(
      fetch(e.request).catch(() => {
        return caches.match(e.request);
      })
    );
  }
});
