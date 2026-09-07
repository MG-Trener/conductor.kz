const CACHE = "conductor-mobile-v63";
const APP_SHELL = [
  "./", "./index.html", "./styles.css?v=15", "./warehouse.css?v=20", "./header-mobile.css?v=1", "./splash.css?v=3", "./release.css?v=1",
  "./app.js?v=109", "./bootstrap.js?v=1", "./core-ui.js?v=1", "./version-history.js?v=1", "./version-history-archive.js?v=1", "./startup-guard.js?v=1",
  "./firebase-config.js?v=22", "./push-config.js?v=1", "./app-update.js?v=1", "./analytics.js?v=1", "./sales-history.js?v=1", "./warehouse-ui.js?v=1",
  "./push-notifications.js?v=1", "./firestore-error-help.js?v=1", "./ui-sounds.js?v=1", "./manifest.webmanifest?v=17", "./icon.svg",
  "./warehouse-splash-clean.png?v=1", "./conductor-vintage-title.png?v=1"
];
self.addEventListener("install", (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())));
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
