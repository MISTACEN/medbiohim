const CACHE_NAME = "medbiohim-static-v1";
const STATIC_EXTENSIONS = /\.(?:css|js|woff2?|ttf|otf|svg|png|jpe?g|webp|ico)$/i;

self.addEventListener("install", (event) => {
  // Offline-fallback для HTML-навигации: без сети пользователь видит
  // понятную страницу вместо браузерной ошибки.
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.add("/offline.html")));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith("medbiohim-static-") && key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/") || url.pathname.includes("login")) return;

  // HTML-навигация: сеть как есть, при сбое — офлайн-страница.
  // API-ответы и auth не кэшируются и не подменяются.
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        return await fetch(request);
      } catch {
        const cache = await caches.open(CACHE_NAME);
        const fallback = await cache.match("/offline.html");
        return fallback || new Response("Нет подключения к сети", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
    })());
    return;
  }

  if (!STATIC_EXTENSIONS.test(url.pathname) || url.pathname.startsWith("/_next/data/")) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) {
      event.waitUntil(fetch(request).then((response) => {
        if (response.ok && response.type === "basic") return cache.put(request, response.clone());
      }).catch(() => {}));
      return cached;
    }
    const response = await fetch(request);
    if (response.ok && response.type === "basic") event.waitUntil(cache.put(request, response.clone()));
    return response;
  })());
});
