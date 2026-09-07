const CACHE = "conductor-mobile-shell";
const APP_SHELL = [
  "./", "./index.html", "./styles.css", "./warehouse.css", "./header-mobile.css", "./splash.css", "./release.css",
  "./app.js", "./auth-throttle.js", "./catalog-core.js", "./catalog-service.js", "./warehouse-domain.js", "./bootstrap.js", "./core-ui.js",
  "./version-history.js", "./version-history-archive.js", "./startup-guard.js", "./auth-throttle.js", "./firebase-config.js", "./push-config.js",
  "./app-update.js", "./analytics.js", "./sales-history.js", "./warehouse-ui.js", "./push-notifications.js",
  "./firestore-error-help.js", "./ui-sounds.js", "./manifest.webmanifest", "./icon.svg",
  "./warehouse-splash-clean.webp", "./conductor-vintage-title.webp"
];

self.addEventListener("install", (event) => event.waitUntil(
  caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
));

self.addEventListener("activate", (event) => event.waitUntil(
  caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith("conductor-mobile-") && key !== CACHE).map((key) => caches.delete(key))))
    .then(() => self.clients.claim())
));

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request, { cache: "no-store" }).then((response) => {
      if (response.ok) caches.open(CACHE).then((cache) => cache.put("./index.html", response.clone()));
      return response;
    }).catch(() => caches.match("./index.html").then((cached) => cached || caches.match("./"))));
    return;
  }

  event.respondWith(fetch(request, { cache: "no-store" }).then((response) => {
    if (response.ok) caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
    return response;
  }).catch(() => caches.match(request)));
});