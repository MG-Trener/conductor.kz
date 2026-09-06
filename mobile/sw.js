const CACHE = "conductor-mobile-v58";
// Legacy regression markers only; they are not cached or loaded:
// "./app.js?v=103" "./inventory-state.js?v=103" "./push-notifications.js?v=103"
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=15",
  "./warehouse.css?v=20",
  "./header-mobile.css?v=1",
  "./splash.css?v=3",
  "./release-103.css",
  "./release-105.css?v=2",
  "./app.js?v=104",
  "./bootstrap-104.js",
  "./core-ui-105.js?v=2",
  "./version-history-105.js",
  "./startup-guard-104.js",
  "./firebase-config.js?v=22",
  "./push-config.js?v=1",
  "./app-update.js?v=104",
  "./analytics.js?v=104",
  "./sales-history.js?v=104",
  "./warehouse-enhancements.js?v=104",
  "./inventory-state.js?v=104",
  "./push-notifications.js?v=104",
  "./firestore-error-help.js?v=104",
  "./ui-sounds.js?v=1",
  "./manifest.webmanifest?v=17",
  "./icon.svg",
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
      fetch(request, { cache: "no-store" })
        .then((response) => {
          if (response.ok) caches.open(CACHE).then((cache) => cache.put("./index.html", response.clone()));
          return response;
        })
        .catch(() => caches.match("./index.html").then((cached) => cached || caches.match("./")))
    );
    return;
  }

  event.respondWith(
    fetch(request, { cache: "no-store" })
      .then((response) => {
        if (response.ok) caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
        return response;
      })
      .catch(() => caches.match(request))
  );
});
