// FILE: src/components/matu/PooledPickupDriverCard.tsx
// Shown to a driver on their trip screen when a pooled-pickup group has
// locked in for their route: member count, efficiency score, and an
// accept/decline choice. Also exposes the standing "auto-accept" preference
// (off by default — manual approve is the safer default; see the migration
// notes in supabase/migrations/20260916100100_pooled_pickup_driver_autoaccept.sql).

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Users, Clock, Gauge, Check, X, Settings2 } from "lucide-react";
import {
  dispatchPool,
  getPoolMembers,
  getDriverPoolPreferences,
  setDriverAutoAccept,
  type PickupPool,
  type PickupPoolMember,
  type DriverPoolPreferences,
} from "@/lib/pooled-pickup";

export function PooledPickupDriverCard({
  pool,
  tripId,
  onHandled,
}: {
  pool: PickupPool;
  tripId: string;
  onHandled?: () => void;
}) {
  const [members, setMembers] = useState<PickupPoolMember[]>([]);
  const [responding, setResponding] = useState(false);

  useEffect(() => {
    getPoolMembers(pool.id).then((m) => setMembers(m.filter((x) => x.status === "pending")));
  }, [pool.id]);

  async function handleAccept() {
    setResponding(true);
    const ok = await dispatchPool(pool.id, tripId);
    setResponding(false);
    if (!ok) {
      toast.error("Couldn't accept the detour. Try again.");
      return;
    }
    toast.success(`Detour accepted — ${members.length} pickups added to your trip.`);
    onHandled?.();
  }

  function handleDecline() {
    // No explicit "decline" RPC — the pool simply stays 'locked' and the
    // matching service will offer it to another nearby driver/trip. This
    // just dismisses the card locally.
    onHandled?.();
  }

  const detourMin = pool.total_detour_seconds != null ? Math.round(pool.total_detour_seconds / 60) : null;

  return (
    <div className="space-y-3 rounded-xl border border-primary/40 bg-primary/5 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-primary">
        <Users className="size-4" />
        Pooled pickup request
      </div>

      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-md bg-surface p-2">
          <div className="text-base font-semibold">{members.length}</div>
          <div className="text-muted-foreground">passengers</div>
        </div>
        <div className="rounded-md bg-surface p-2">
          <div className="text-base font-semibold">{detourMin ?? "—"}</div>
          <div className="text-muted-foreground">min detour</div>
        </div>
        <div className="rounded-md bg-surface p-2">
          <div className="flex items-center justify-center gap-1 text-base font-semibold">
            <Gauge className="size-3.5" />
            {pool.efficiency_score ?? "—"}
          </div>
          <div className="text-muted-foreground">sec/rider</div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Clock className="size-3.5 shrink-0" />
        Pool locked {pool.locked_at ? new Date(pool.locked_at).toLocaleTimeString() : ""} — accepting
        now commits you to the detour; cancelling after this point penalizes any passenger who backs
        out, not you.
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleAccept}
          disabled={responding}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          <Check className="size-4" /> Accept detour
        </button>
        <button
          onClick={handleDecline}
          disabled={responding}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-secondary"
        >
          <X className="size-4" /> Skip
        </button>
      </div>
    </div>
  );
}

// Small settings widget — drop into the driver's account/settings screen.
// Lets a driver opt into auto-accepting pools within their own (optionally
// tighter-than-platform) comfort thresholds, so they stop seeing the manual
// prompt above for pools that clearly qualify.
export function PooledPickupAutoAcceptSetting() {
  const [prefs, setPrefs] = useState<DriverPoolPreferences | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getDriverPoolPreferences().then(setPrefs);
  }, []);

  async function toggle(enabled: boolean) {
    setSaving(true);
    const ok = await setDriverAutoAccept({
      enabled,
      maxMembers: prefs?.max_auto_accept_members ?? null,
      maxDetourSeconds: prefs?.max_auto_accept_detour_seconds ?? null,
    });
    setSaving(false);
    if (ok) {
      setPrefs((p) => (p ? { ...p, auto_accept_enabled: enabled } : p));
      toast.success(enabled ? "Auto-accept turned on" : "Auto-accept turned off");
    } else {
      toast.error("Couldn't save that setting.");
    }
  }

  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start gap-2">
        <Settings2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div>
          <div className="text-sm font-medium">Auto-accept pooled pickups</div>
          <p className="text-xs text-muted-foreground">
            Skip the manual prompt for pools within the platform's detour limits. Off by default —
            you'll always see the request card unless you turn this on.
          </p>
        </div>
      </div>
      <button
        onClick={() => toggle(!(prefs?.auto_accept_enabled ?? false))}
        disabled={saving}
        className={`h-6 w-11 shrink-0 rounded-full transition-colors ${
          prefs?.auto_accept_enabled ? "bg-primary" : "bg-muted"
        }`}
      >
        <span
          className={`block size-5 translate-x-0.5 rounded-full bg-white transition-transform ${
            prefs?.auto_accept_enabled ? "translate-x-5" : ""
          }`}
        />
      </button>
    </div>
  );
}

// ============== INTEGRATION NOTE ==============
// - <PooledPickupDriverCard /> — drop into src/routes/_authenticated/drive.trip.tsx,
//   subscribed via getLockedPoolsForRoute(routeId) (see src/lib/pooled-pickup.ts)
//   for the driver's current trip's route. Render one card per locked pool
//   until the driver accepts/skips it.
// - <PooledPickupAutoAcceptSetting /> — drop into src/routes/_authenticated/account.tsx
//   near other driver-only preferences.
