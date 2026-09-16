// FILE: src/components/matu/PooledPickupPanel.tsx
// Passenger-facing "Pooled Pickup" flow: drop a pin at home, and if enough
// nearby neighbors heading to the same place join too, a matatu detours to
// collect everyone at their gate instead of the nearest stage. Mirrors the
// informal group-charter pattern (e.g. a burial trip) but matched
// algorithmically and priced transparently.
//
// Usage: drop this into the existing route/booking screen (e.g.
// ride.$routeId.tsx) alongside the normal "walk to a stage" flow, passing the
// route + destination stage the passenger already picked there. See the
// integration note at the bottom of this file.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MapPin, Users, Clock, X, Loader2 } from "lucide-react";
import { RouteMap } from "@/components/matu/RouteMap";
import {
  requestPooledPickup,
  cancelPoolMembership,
  getPool,
  getPoolMembers,
  getMyActivePoolMembership,
  subscribeToPool,
  getPooledPickupConfig,
  type PickupPool,
  type PickupPoolMember,
  type PooledPickupConfig,
} from "@/lib/pooled-pickup";

export function PooledPickupPanel({
  routeId,
  destinationStageId,
  destinationLabel,
}: {
  routeId: string;
  destinationStageId: string;
  destinationLabel: string;
}) {
  const [config, setConfig] = useState<PooledPickupConfig | null>(null);
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [membership, setMembership] = useState<PickupPoolMember | null>(null);
  const [pool, setPool] = useState<PickupPool | null>(null);
  const [members, setMembers] = useState<PickupPoolMember[]>([]);
  const [joining, setJoining] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // Restore an in-progress pool on load/refresh instead of showing the pin
  // drop screen again.
  useEffect(() => {
    (async () => {
      const [cfg, existing] = await Promise.all([
        getPooledPickupConfig(),
        getMyActivePoolMembership(),
      ]);
      setConfig(cfg);
      if (existing) {
        setMembership(existing);
        setPin({ lat: existing.pin_lat, lng: existing.pin_lng });
      }
    })();
  }, []);

  // Live-refresh the pool + its members while the passenger is in one.
  useEffect(() => {
    if (!membership) return;
    let cancelled = false;

    async function refresh() {
      const [p, m] = await Promise.all([
        getPool(membership!.pool_id),
        getPoolMembers(membership!.pool_id),
      ]);
      if (cancelled) return;
      setPool(p);
      setMembers(m);
      // Keep our own membership row's status in sync (e.g. it flips to
      // 'cancelled_penalized' or 'picked_up' from the driver/backend side).
      const mine = m.find((x) => x.id === membership!.id);
      if (mine) setMembership(mine);
    }

    refresh();
    const unsubscribe = subscribeToPool(membership.pool_id, refresh);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [membership?.pool_id]);

  async function handleJoin() {
    if (!pin) {
      toast.error("Drop a pin at your pickup spot first");
      return;
    }
    setJoining(true);
    const poolId = await requestPooledPickup({
      routeId,
      destinationStageId,
      pinLat: pin.lat,
      pinLng: pin.lng,
    });
    setJoining(false);
    if (!poolId) {
      toast.error("Couldn't join a pool right now. Try again shortly.");
      return;
    }
    const mine = await getMyActivePoolMembership();
    if (mine) setMembership(mine);
    toast.success("You're in! We'll notify you as more neighbors join.");
  }

  async function handleCancel() {
    if (!membership) return;
    setCancelling(true);
    const ok = await cancelPoolMembership(membership.id, "passenger_cancelled");
    setCancelling(false);
    if (!ok) {
      toast.error("Couldn't cancel right now. Try again.");
      return;
    }
    const penalized = pool?.status === "dispatched";
    toast(
      penalized
        ? "Cancelled — since the matatu was already on its way, a partial fee was deducted from your wallet."
        : "Cancelled — no charge.",
    );
    setMembership(null);
    setPool(null);
    setMembers([]);
    setPin(null);
  }

  const activeMembers = members.filter((m) => m.status === "pending");
  const minSize = config?.min_pool_size ?? 3;
  const stillNeeded = Math.max(0, minSize - activeMembers.length);

  // ============== NOT YET IN A POOL: pin-drop screen ==============
  if (!membership) {
    return (
      <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Users className="size-4 text-primary" />
          Pooled Pickup to {destinationLabel}
        </div>
        <p className="text-xs text-muted-foreground">
          Skip the walk to the stage. Drop a pin at your gate — if enough neighbors headed the same
          way join in, a matatu comes to collect everyone directly.
          {config && (
            <>
              {" "}
              Needs at least {config.min_pool_size} people; fee is Ksh {config.pooling_fee_floor}–
              {config.pooling_fee_ceiling} per person depending on how many join.
            </>
          )}
        </p>

        <div className="h-56 overflow-hidden rounded-lg border border-border">
          <RouteMap
            stages={[]}
            pin={pin}
            onMapClick={(lat, lng) => setPin({ lat, lng })}
            className="h-full w-full"
          />
        </div>

        {pin ? (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="size-3.5" /> Pin set — tap the map again to move it.
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="size-3.5" /> Tap the map to drop a pin at your gate.
          </div>
        )}

        <button
          onClick={handleJoin}
          disabled={!pin || joining}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {joining && <Loader2 className="size-4 animate-spin" />}
          {joining ? "Joining…" : "Request Pooled Pickup"}
        </button>
      </div>
    );
  }

  // ============== IN A POOL: live status ==============
  const statusCopy: Record<string, string> = {
    forming: `Forming — ${activeMembers.length}/${minSize} joined${
      stillNeeded > 0 ? `, need ${stillNeeded} more` : ""
    }`,
    locked: "Matched! Waiting for a driver to accept the detour.",
    dispatched: "On the way — the matatu has accepted and is en route.",
    completed: "Picked up. Enjoy the ride!",
    collapsed: "This pool didn't fill in time.",
  };

  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Users className="size-4 text-primary" />
          Pooled Pickup to {destinationLabel}
        </div>
        {membership.status === "pending" && pool?.status !== "dispatched" && (
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-secondary disabled:opacity-50"
          >
            {cancelling ? <Loader2 className="size-3 animate-spin" /> : <X className="size-3" />}
            Cancel
          </button>
        )}
      </div>

      <div className="rounded-lg bg-primary/10 p-3 text-sm font-medium text-primary">
        {pool ? statusCopy[pool.status] : "Loading…"}
      </div>

      {pool?.status === "dispatched" && (
        <div className="flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
          <Clock className="size-3.5 shrink-0" />
          The matatu is already on its way — cancelling now forfeits part of the fare.
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {activeMembers.length} rider{activeMembers.length === 1 ? "" : "s"} in this pool
        </span>
        {membership.fare_quote != null && <span>Your fare: Ksh {membership.fare_quote}</span>}
      </div>

      {pool?.efficiency_score != null && (
        <div className="text-[11px] text-muted-foreground">
          Estimated detour: ~{Math.round(pool.total_detour_seconds! / 60)} min total, split across
          the group.
        </div>
      )}

      {membership.status !== "pending" && (
        <div className="rounded-md border border-border p-2 text-xs text-muted-foreground">
          {membership.status === "cancelled_penalized" &&
            "Cancelled — a partial fee was deducted since the matatu was already dispatched."}
          {membership.status === "cancelled_free" && "Cancelled — no charge."}
          {membership.status === "dropped_by_backfill_failure" &&
            "This pool couldn't fill in time. You've been refunded — try booking from the nearest stage instead."}
          {membership.status === "picked_up" && "You've been picked up. Enjoy the ride!"}
        </div>
      )}
    </div>
  );
}

// ============== INTEGRATION NOTE ==============
// Drop <PooledPickupPanel routeId={...} destinationStageId={...} destinationLabel={...} />
// into src/routes/_authenticated/ride.$routeId.tsx, e.g. as an alternate tab
// next to the existing "walk to a stage" booking flow, once the passenger has
// picked a route and destination stage there. It's self-contained (fetches
// its own config/membership/pool state), so no extra props are needed beyond
// which route + destination it's pooling toward.
