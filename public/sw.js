// Legacy service-worker kill switch.
// This file intentionally does not cache requests. It unregisters itself and clears old caches.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      } catch (_) {}
      try {
        await self.registration.unregister();
      } catch (_) {}
      try {
        const clients = await self.clients.matchAll({ type: "window" });
        for (const client of clients) client.navigate(client.url);
      } catch (_) {}
    })(),
  );
});
