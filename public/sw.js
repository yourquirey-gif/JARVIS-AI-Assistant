const CACHE = "ultron-shell-v4";
const SHELL = ["/", "/manifest.webmanifest", "/ultron-icon.svg"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/downloads/")) return;
  event.respondWith(fetch(event.request).catch(() => {
    if (event.request.mode === "navigate") return caches.match("/");
    return caches.match(event.request);
  }));
});
