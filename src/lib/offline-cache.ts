// Minimal IndexedDB wrapper for offline read caching. No external deps —
// just enough to stash the last-fetched routes/stages/bookings so the app
// has something to show when there's no connection, instead of a blank
// screen or a stuck spinner.
//
// This is Phase 1 (read-only offline browsing) of the offline-first plan.
// Phase 2 will add a write queue on top of this same DB for actions taken
// while offline (bookings, cash-collected, alighted, etc).

const DB_NAME = "matu-offline";
const DB_VERSION = 1;

// One object store per cached "table". Keyed by the row's own id.
export const STORES = ["routes", "stages", "bookings", "meta", "queue"] as const;
export type StoreName = (typeof STORES)[number];

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) return reject(new Error("IndexedDB not supported"));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const store of STORES) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath: "id" });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Replaces the entire contents of a store with a fresh set of rows. Used
// right after a successful network fetch, so the cache always reflects the
// last known-good server state (not a merge — stale/deleted rows shouldn't
// linger).
export async function cacheReplaceAll<T extends { id: string }>(
  store: StoreName,
  rows: T[],
): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).clear();
      for (const row of rows) tx.objectStore(store).put(row);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // IndexedDB unavailable (private browsing, old browser, etc) — offline
    // caching just silently doesn't happen, the app still works online.
  }
}

export async function cacheGetAll<T>(store: StoreName): Promise<T[]> {
  try {
    const db = await openDb();
    const rows = await new Promise<T[]>((resolve, reject) => {
      const tx = db.transaction(store, "readonly");
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result as T[]);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return rows;
  } catch {
    return [];
  }
}

// Small "meta" store for a last-synced timestamp per cache key, so the UI
// can say "showing data from 4 hours ago" rather than pretending it's live.
export async function setLastSynced(key: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("meta", "readwrite");
      tx.objectStore("meta").put({ id: key, syncedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // no-op, see cacheReplaceAll
  }
}

export async function getLastSynced(key: string): Promise<number | null> {
  try {
    const db = await openDb();
    const row = await new Promise<{ id: string; syncedAt: number } | undefined>(
      (resolve, reject) => {
        const tx = db.transaction("meta", "readonly");
        const req = tx.objectStore("meta").get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      },
    );
    db.close();
    return row?.syncedAt ?? null;
  } catch {
    return null;
  }
}

// --- Write queue (Phase 2) -------------------------------------------------
//
// Only for actions that are safe to replay later with no server-side
// arbitration needed: idempotent status flips like "mark cash collected" or
// "mark alighted". Anything that needs a live capacity check or payment
// (booking a seat) is deliberately NOT queued here — see drive.trip.tsx /
// ride.$routeId.tsx comments for why.

export type QueuedAction = {
  id: string; // uuid, doubles as the IndexedDB key
  type: "mark_cash_collected" | "mark_alighted" | "confirm_manual_payment";
  bookingId: string;
  createdAt: number;
};

export async function enqueueAction(action: QueuedAction): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("queue", "readwrite");
      tx.objectStore("queue").put(action);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // If IndexedDB itself is unavailable, there's nowhere to queue this —
    // the caller already applied the optimistic UI update, so the action is
    // just lost on refresh. Rare (private browsing / very old browsers).
  }
}

export async function getQueuedActions(): Promise<QueuedAction[]> {
  return cacheGetAll<QueuedAction>("queue");
}

export async function removeQueuedAction(id: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("queue", "readwrite");
      tx.objectStore("queue").delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // no-op
  }
}

// --- Supabase config cache (Phase 3) ---------------------------------------
//
// The service worker runs in its own context with no access to
// localStorage (where the Supabase SDK keeps the session) and can't import
// the app's TS modules. To let the SW make its own authenticated REST calls
// — the whole point of Background Sync, so queued actions flush even if
// the tab isn't open — the page stashes the current URL/key/access token
// here in IndexedDB, which both contexts can read.
export type SupabaseConfig = { url: string; anonKey: string; accessToken: string | null };

export async function cacheSupabaseConfig(config: SupabaseConfig): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("meta", "readwrite");
      tx.objectStore("meta").put({ id: "supabase-config", ...config });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // no-op — worst case the SW-side background sync can't authenticate and
    // the page-side online-event flush (Phase 2) covers it instead.
  }
}
