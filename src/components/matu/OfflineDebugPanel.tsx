import { useEffect, useState } from "react";
import { RefreshCw, Wifi, WifiOff } from "lucide-react";
import { getQueuedActions, getLastSynced, type QueuedAction } from "@/lib/offline-cache";
import { flushQueue } from "@/lib/offline-queue";
import { useOnlineStatus } from "@/components/matu/OfflineBanner";

// Surfaces what's actually sitting in the offline write queue and when data
// was last cached, so verifying the offline/background-sync behavior (Phases
// 1-3) doesn't require plugging a phone into DevTools. Admin-only, read-only
// except for the manual "Flush now" button.
export function OfflineDebugPanel() {
  const online = useOnlineStatus();
  const [queue, setQueue] = useState<QueuedAction[]>([]);
  const [lastSynced, setLastSyncedAt] = useState<number | null>(null);
  const [flushing, setFlushing] = useState(false);

  async function refresh() {
    const [q, ts] = await Promise.all([getQueuedActions(), getLastSynced("routes-stages")]);
    setQueue(q);
    setLastSyncedAt(ts);
  }

  useEffect(() => {
    refresh();
    const iv = setInterval(refresh, 5000);
    return () => clearInterval(iv);
  }, []);

  async function handleFlush() {
    setFlushing(true);
    const result = await flushQueue();
    setFlushing(false);
    await refresh();
    if (result.synced === 0 && result.failed === 0 && queue.length > 0) {
      // Most likely cause: still offline, flushQueue bails out early.
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">Offline sync debug</h2>
        <span
          className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ${
            online ? "bg-primary/10 text-primary" : "bg-amber-500/15 text-amber-700"
          }`}
        >
          {online ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}
          {online ? "Online" : "Offline"}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs opacity-70">Pending actions</dt>
          <dd className="text-lg font-semibold">{queue.length}</dd>
        </div>
        <div>
          <dt className="text-xs opacity-70">Routes/stages last synced</dt>
          <dd className="text-sm font-medium">
            {lastSynced ? new Date(lastSynced).toLocaleString() : "Never"}
          </dd>
        </div>
      </dl>

      {queue.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-border pt-3">
          {queue.map((a) => (
            <li key={a.id} className="flex items-center justify-between text-xs">
              <span className="font-mono opacity-80">
                {a.type} · booking {a.bookingId.slice(0, 8)}…
              </span>
              <span className="opacity-60">{new Date(a.createdAt).toLocaleTimeString()}</span>
            </li>
          ))}
        </ul>
      )}

      <button
        onClick={handleFlush}
        disabled={flushing || !online || queue.length === 0}
        className="mt-3 flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-40"
      >
        <RefreshCw className={`size-3.5 ${flushing ? "animate-spin" : ""}`} />
        Flush now
      </button>
    </div>
  );
}
