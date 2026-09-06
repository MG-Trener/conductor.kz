const CACHE = "conductor-mobile-v50";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=15",
  "./warehouse.css?v=20",
  "./header-mobile.css?v=1",
  "./app.js?v=24",
  "./bootstrap.js?v=1",
  "./firebase-config.js?v=22",
  "./push-config.js?v=1",
  "./app-update.js",
  "./analytics.js",
  "./sales-history.js",
  "./warehouse-enhancements.js",
  "./warehouse-enhancements-legacy.js?v=1",
  "./version-history.js",
  "./ui-fixes-070.js",
  "./inventory-state.js",
  "./push-notifications.js",
  "./firestore-error-help.js",
  "./release-20260906.js",
  "./manifest.webmanifest?v=17",
  "./icon.svg",
  "./splash.css?v=3",
  "./warehouse-splash-clean.png?v=1",
  "./conductor-vintage-title.png?v=1"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) caches.open(CACHE).then((cache) => cache.put("./index.html", response.clone()));
          return response;
        })
        .catch(() => caches.match("./index.html").then((cached) => cached || caches.match("./")))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
