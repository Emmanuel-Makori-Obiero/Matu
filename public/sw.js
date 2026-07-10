// Minimal service worker — exists only to satisfy installability requirements on
// some Android/Chrome versions (a registered SW with a fetch handler). It does NOT
// cache anything: every request just passes straight through to the network, so
// users always get the latest deployed version. If real offline support is wanted
// later, add a cache-first strategy for /icons and static assets here — but leave
// API calls (Supabase) and HTML/JS out of any cache so the app never goes stale.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
