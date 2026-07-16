import { supabase } from "@/integrations/supabase/client";
import { getQueuedActions, removeQueuedAction, type QueuedAction } from "@/lib/offline-cache";

// Replays a single queued action against Supabase. Both action types are
// pure idempotent status writes — replaying one that already landed (e.g.
// the driver got signal back mid-tap and it actually went through) is
// harmless, it just re-sets the same value.
async function replay(action: QueuedAction): Promise<boolean> {
  if (action.type === "mark_cash_collected") {
    // Direct column writes to cash_collected are revoked at the DB level —
    // this must go through the driver-verified RPC, same as the online path.
    const { error } = await supabase.rpc("confirm_cash_payment", {
      p_booking_id: action.bookingId,
    });
    return !error;
  }
  if (action.type === "confirm_manual_payment") {
    const { error } = await supabase.rpc("confirm_manual_payment", {
      p_booking_id: action.bookingId,
    });
    return !error;
  }
  if (action.type === "mark_alighted") {
    const { error } = await supabase
      .from("bookings")
      .update({ status: "alighted" })
      .eq("id", action.bookingId);
    return !error;
  }
  return true;
}

let flushing = false;

// Drains the queue in order. Safe to call repeatedly/concurrently (e.g. both
// an 'online' event and a mount-time check firing close together) — the
// flushing guard makes extra calls a no-op rather than double-sending.
export async function flushQueue(): Promise<{ synced: number; failed: number }> {
  if (flushing) return { synced: 0, failed: 0 };
  if (typeof navigator !== "undefined" && !navigator.onLine) return { synced: 0, failed: 0 };
  flushing = true;
  let synced = 0;
  let failed = 0;
  try {
    const queue = await getQueuedActions();
    // Oldest first, so e.g. a cash-collected mark from an hour ago doesn't
    // land after a more recent alighted mark for the same booking.
    queue.sort((a, b) => a.createdAt - b.createdAt);
    for (const action of queue) {
      const ok = await replay(action);
      if (ok) {
        await removeQueuedAction(action.id);
        synced++;
      } else {
        failed++;
        // Leave it queued and stop — if this one failed for a real reason
        // (not just "still offline"), retrying the rest immediately in the
        // same pass is unlikely to help and can spam errors.
        break;
      }
    }
  } finally {
    flushing = false;
  }
  return { synced, failed };
}

// Registers a Background Sync event so the service worker gets woken up to
// flush the queue even if this tab is backgrounded or closed before
// connectivity returns (Chrome/Android only — see registerBackgroundSync
// comment below for the fallback on browsers without it).
export async function registerBackgroundSync(): Promise<void> {
  if (!("serviceWorker" in navigator) || !("SyncManager" in window)) {
    // No Background Sync support (all of iOS Safari, Firefox). The
    // page-side flush from initQueueSync — on load and on the 'online'
    // event — is the fallback here, it just requires the tab to actually
    // be open at some point after connectivity returns.
    return;
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    await (
      reg as ServiceWorkerRegistration & { sync: { register: (tag: string) => Promise<void> } }
    ).sync.register("flush-matu-queue");
  } catch {
    // Registration can fail (e.g. permission denied) — the online-event
    // fallback still covers it.
  }
}

// Wires up automatic flushing: once when the app loads (in case actions
// were queued in a previous session and never synced), and every time the
// browser regains connectivity. Call once from the root component.
export function initQueueSync() {
  if (typeof window === "undefined") return () => {};
  flushQueue();
  const onOnline = () => flushQueue();
  window.addEventListener("online", onOnline);
  return () => window.removeEventListener("online", onOnline);
}
