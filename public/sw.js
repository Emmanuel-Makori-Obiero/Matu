// Phase 1: real caching instead of pass-through.
// Phase 3: Background Sync — this file now also flushes the offline write
// queue directly against Supabase's REST API, with no page open at all.
// That's the whole point of Background Sync vs. the Phase 2 page-side
// 'online' event listener: this can fire minutes after the tab was closed,
// as long as the browser process is still running (Chrome/Android only —
// Safari/iOS and Firefox don't implement the Background Sync API at all,
// so on those the Phase 2 fallback — flush on load / on 'online' — is what
// actually does the work).

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
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            // Clone immediately, in this same tick — the caller starts
            // reading the returned `res` body right away, so cloning inside
            // the caches.open().then() below (after an async hop) can race
            // against that and throw "Response body is already used".
            if (res.ok) {
              const resClone = res.clone();
              caches.open(STATIC_CACHE).then((c) => c.put(req, resClone));
            }
            return res;
          }),
      ),
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("/offline.html")));
  }
});

// --- Background Sync: flush the offline write queue -----------------------
//
// Duplicated here (rather than imported) because a plain public/sw.js can't
// import the app's TS modules — this reads the exact same "matu-offline"
// IndexedDB database that src/lib/offline-cache.ts writes to, using the
// raw IndexedDB API directly.

const DB_NAME = "matu-offline";
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    // No onupgradeneeded here on purpose — the page always opens the DB
    // first and creates the stores; if this runs before that's ever
    // happened there's nothing to flush anyway.
  });
}

function idbGetAll(db, store) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet(db, store, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbDelete(db, store, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Same two safe, idempotent action types as offline-queue.ts's replay().
// Keep these in sync if new queueable action types are ever added.
async function replayAction(config, action) {
  const patchBody =
    action.type === "mark_cash_collected"
      ? { cash_collected: true }
      : action.type === "mark_alighted"
        ? { status: "alighted" }
        : null;
  if (!patchBody) return true; // unknown type, don't block the rest of the queue on it

  const res = await fetch(`${config.url}/rest/v1/bookings?id=eq.${action.bookingId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      apikey: config.anonKey,
      ...(config.accessToken ? { Authorization: `Bearer ${config.accessToken}` } : {}),
      Prefer: "return=minimal",
    },
    body: JSON.stringify(patchBody),
  });
  return res.ok;
}

async function flushQueueInBackground() {
  const db = await openDb();
  try {
    const config = await idbGet(db, "meta", "supabase-config");
    if (!config || !config.url || !config.anonKey) return; // nothing to auth with

    const queue = await idbGetAll(db, "queue");
    queue.sort((a, b) => a.createdAt - b.createdAt);

    for (const action of queue) {
      const ok = await replayAction(config, action);
      if (ok) {
        await idbDelete(db, "queue", action.id);
      } else {
        // Leave remaining items queued and let Background Sync's built-in
        // retry-with-backoff handle trying again later, rather than
        // hammering a possibly-still-down connection right now.
        throw new Error(`Failed to sync action ${action.id}`);
      }
    }
  } finally {
    db.close();
  }
}

self.addEventListener("sync", (event) => {
  if (event.tag === "flush-matu-queue") {
    event.waitUntil(flushQueueInBackground());
  }
});

// --- Web Push: trip progress + driver-arrived notifications ---------------
//
// Sent by the supabase/functions/send-trip-push edge function, triggered
// from the driver's screen. Progress notifications reuse the same `tag`
// (matu-progress-<trip_id>) every time, so the browser replaces the existing
// notification's text in place rather than stacking a new one each update —
// that's what makes it read as "live" instead of spamming the tray.
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }
  const { title, body, tag, icon, badge, data, requireInteraction, vibrate } = payload;
  event.waitUntil(
    self.registration.showNotification(title || "Matu", {
      body,
      tag,
      icon: icon || "/icons/icon-192.png",
      badge: badge || "/icons/icon-192.png",
      data,
      requireInteraction: !!requireInteraction,
      vibrate: vibrate || undefined,
      // Renotify only for the arrival alert (requireInteraction is only set
      // there) — a progress update replacing itself shouldn't re-buzz the
      // phone every ~minute, only the one-off "driver has arrived" should.
      renotify: !!requireInteraction,
    }),
  );
});

// Tapping the notification focuses an already-open Matu tab if there is one,
// otherwise opens a new one straight to that booking's tracking screen.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of allClients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(url);
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
