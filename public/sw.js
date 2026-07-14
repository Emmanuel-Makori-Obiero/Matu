// Phase 1 of offline support: real caching instead of the old pass-through
// stub. Strategy split by request type, because a TanStack Start app is
// server-rendered per-route (auth-aware, dynamic), so it's NOT safe to
// blanket-cache HTML like a static SPA shell would:
//
// - Static, hashed build assets (/assets/, /_build/, fonts, icons):
//   cache-first, since the filename changes whenever the content does.
// - Everything else (HTML navigations, Supabase API calls, etc): network
//   first, always. On failure, navigations fall back to a small static
//   offline.html instead of a blank tab; non-navigation requests just fail
//   and the app's own offline-cache (IndexedDB) takes over from there.

const STATIC_CACHE = "matu-static-v1";
const PRECACHE_URLS = [
  "/offline.html",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== STATIC_CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/_build/") ||
    url.pathname.startsWith("/icons/") ||
    /\.(js|css|woff2?|png|jpg|jpeg|svg|webp)$/.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // never intercept writes
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // don't touch Supabase/Mapbox calls

  if (isStaticAsset(url)) {
    // Cache-first: instant on repeat visits, and these filenames are
    // content-hashed by the build so a stale cache hit is never wrong.
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            if (res.ok) caches.open(STATIC_CACHE).then((c) => c.put(req, res.clone()));
            return res;
          }),
      ),
    );
    return;
  }

  if (req.mode === "navigate") {
    // Network-first for page loads — this app is server-rendered and
    // auth-aware, so we always want the live page when there's a
    // connection. Only fall back to the static offline page if the network
    // request fails outright.
    event.respondWith(fetch(req).catch(() => caches.match("/offline.html")));
  }
  // All other GETs (API calls etc) pass straight through, uncached.
});
