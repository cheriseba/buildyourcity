// Cache: Seite, Daten, Bildpruefungen und Charakterbilder immer zuerst aus dem Netz,
// alles andere (Tiles, Schrift, p5) sofort aus dem Cache und im Hintergrund aktualisiert.
const CACHE = "build-your-city-v2";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  const isP5 = url.hostname === "cdnjs.cloudflare.com";
  if (!sameOrigin && !isP5) return;

  const isCharacterAsset = url.pathname.startsWith("/character/");
  const networkFirst = request.mode === "navigate" || /\.(html|csv|json)$/i.test(url.pathname) || url.searchParams.has("tile-check") || isCharacterAsset;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      const fetchAndStore = fetch(request, isCharacterAsset ? { cache: "no-cache" } : undefined).then((response) => {
        if (response.ok) cache.put(request, response.clone());
        return response;
      });

      if (networkFirst) {
        return fetchAndStore.catch(() => cached || Response.error());
      }
      if (cached) {
        fetchAndStore.catch(() => {});
        return cached;
      }
      return fetchAndStore;
    })
  );
});
