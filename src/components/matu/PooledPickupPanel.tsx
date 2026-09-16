import { useEffect, useState } from "react";
import { Users, MapPinned, X, Loader2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type PoolStatus = "forming" | "locked" | "dispatched" | "completed" | "collapsed";
type MemberStatus =
  | "pending"
  | "cancelled_free"
  | "cancelled_penalized"
  | "picked_up"
  | "dropped_by_backfill_failure";

type PoolConfig = {
  min_pool_size: number;
  max_pool_size: number;
  cancellation_penalty_percent: number;
};

type PoolRow = {
  id: string;
  status: PoolStatus;
  per_head_fee: number | null;
  total_detour_seconds: number | null;
};

type MemberRow = {
  id: string;
  pool_id: string;
  status: MemberStatus;
  fare_quote: number | null;
  fare_final: number | null;
};

/**
 * Lets a passenger request a pooled (shared) pickup for a route + destination
 * stage instead of walking to a stage, and shows them the live status of the
 * pool they're in (forming -> locked -> dispatched -> completed/collapsed).
 *
 * Mirrors the request_pooled_pickup / cancel_pool_membership RPC flow from the
 * `pooled_pickup` migration.
 */
export function PooledPickupPanel({
  routeId,
  destinationStageId,
  passengerId,
}: {
  routeId: string;
  destinationStageId: string;
  passengerId: string;
}) {
  const [config, setConfig] = useState<PoolConfig | null>(null);
  const [membership, setMembership] = useState<MemberRow | null>(null);
  const [pool, setPool] = useState<PoolRow | null>(null);
  const [memberCount, setMemberCount] = useState(0);
  const [requesting, setRequesting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);

  useEffect(() => {
    supabase
      .from("pooled_pickup_config")
      .select("min_pool_size, max_pool_size, cancellation_penalty_percent")
      .single()
      .then(({ data }) => {
        if (data) setConfig(data as PoolConfig);
      });
  }, []);

  // Restore any pool this passenger is already in for this route+destination.
  useEffect(() => {
    let cancelled = false;
    async function loadExisting() {
      const { data: memberRows } = await supabase
        .from("pickup_pool_members")
        .select("id, pool_id, status, fare_quote, fare_final")
        .eq("passenger_id", passengerId)
        .in("status", ["pending"])
        .order("joined_at", { ascending: false })
        .limit(1);

      const existing = memberRows?.[0];
      if (!existing || cancelled) return;

      const { data: poolRow } = await supabase
        .from("pickup_pools")
        .select("id, status, per_head_fee, total_detour_seconds")
        .eq("id", existing.pool_id)
        .eq("route_id", routeId)
        .eq("destination_stage_id", destinationStageId)
        .maybeSingle();

      if (!poolRow || cancelled) return;
      setMembership(existing as MemberRow);
      setPool(poolRow as PoolRow);
    }
    loadExisting();
    return () => {
      cancelled = true;
    };
  }, [passengerId, routeId, destinationStageId]);

  // Live-update the pool status and member count while forming/locked/dispatched.
  useEffect(() => {
    if (!pool) return;

    const refreshCount = async () => {
      const { count } = await supabase
        .from("pickup_pool_members")
        .select("id", { count: "exact", head: true })
        .eq("pool_id", pool.id)
        .eq("status", "pending");
      setMemberCount(count ?? 0);
    };
    refreshCount();

    const channel = supabase
      .channel(`pickup-pool-${pool.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "pickup_pools", filter: `id=eq.${pool.id}` },
        (payload) => {
          const next = payload.new as PoolRow;
          setPool(next);
          if (next.status === "dispatched")
            toast.success("Your pooled pickup has been dispatched!");
          if (next.status === "collapsed")
            toast.error("This pool couldn't fill in time and was cancelled.");
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pickup_pool_members",
          filter: `pool_id=eq.${pool.id}`,
        },
        () => refreshCount(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [pool?.id]);

  async function handleRequestPickup() {
    setGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        setGettingLocation(false);
        setRequesting(true);
        try {
          const { data: poolId, error } = await supabase.rpc("request_pooled_pickup", {
            _passenger_id: passengerId,
            _route_id: routeId,
            _destination_stage_id: destinationStageId,
            _pin_lat: position.coords.latitude,
            _pin_lng: position.coords.longitude,
          });
          if (error) throw error;

          const { data: poolRow } = await supabase
            .from("pickup_pools")
            .select("id, status, per_head_fee, total_detour_seconds")
            .eq("id", poolId)
            .single();
          const { data: memberRow } = await supabase
            .from("pickup_pool_members")
            .select("id, pool_id, status, fare_quote, fare_final")
            .eq("pool_id", poolId)
            .eq("passenger_id", passengerId)
            .eq("status", "pending")
            .order("joined_at", { ascending: false })
            .limit(1)
            .single();

          setPool(poolRow as PoolRow);
          setMembership(memberRow as MemberRow);
          toast.success("Added to a pooled pickup near you");
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Couldn't request a pooled pickup");
        } finally {
          setRequesting(false);
        }
      },
      () => {
        setGettingLocation(false);
        toast.error("We need your location to match you to a nearby pool");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function handleCancel() {
    if (!membership) return;
    setCancelling(true);
    try {
      const { error } = await supabase.rpc("cancel_pool_membership", {
        _member_id: membership.id,
        _reason: "passenger_cancelled",
      });
      if (error) throw error;
      const penalized = pool?.status === "dispatched";
      toast(
        penalized
          ? "Cancelled — a penalty was charged from your wallet"
          : "Pooled pickup cancelled",
        {
          icon: penalized ? <Wallet className="h-4 w-4" /> : undefined,
        },
      );
      setMembership(null);
      setPool(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't cancel");
    } finally {
      setCancelling(false);
    }
  }

  if (!membership || !pool) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-primary" />
            Pooled pickup
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Skip the walk to the stage — share a pickup with others nearby heading the same way.
            {config ? ` Needs ${config.min_pool_size}+ people to lock in.` : ""}
          </p>
          <Button
            onClick={handleRequestPickup}
            disabled={requesting || gettingLocation}
            className="w-full"
          >
            {requesting || gettingLocation ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MapPinned className="h-4 w-4" />
            )}
            {gettingLocation
              ? "Getting your location…"
              : requesting
                ? "Requesting…"
                : "Request pooled pickup"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const statusLabel: Record<PoolStatus, string> = {
    forming: "Waiting for more passengers",
    locked: "Pool locked — waiting for a driver",
    dispatched: "On the way to you",
    completed: "Completed",
    collapsed: "Cancelled",
  };
  const statusVariant: Record<PoolStatus, "secondary" | "default" | "outline" | "destructive"> = {
    forming: "secondary",
    locked: "default",
    dispatched: "default",
    completed: "outline",
    collapsed: "destructive",
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Pooled pickup
          </span>
          <Badge variant={statusVariant[pool.status]}>{statusLabel[pool.status]}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">People in this pool</span>
          <span className="font-medium">
            {memberCount}
            {config ? ` / ${config.max_pool_size}` : ""}
          </span>
        </div>
        {pool.per_head_fee != null && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Pooling fee</span>
            <span className="font-medium">KES {pool.per_head_fee.toFixed(0)} / person</span>
          </div>
        )}
        {pool.status === "forming" && config && memberCount < config.min_pool_size && (
          <p className="text-xs text-muted-foreground">
            Needs {config.min_pool_size - memberCount} more to lock in.
          </p>
        )}
        {(pool.status === "forming" || pool.status === "locked") && (
          <Button variant="outline" onClick={handleCancel} disabled={cancelling} className="w-full">
            {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
            Cancel
          </Button>
        )}
        {pool.status === "dispatched" && (
          <p className="text-xs text-muted-foreground">
            Cancelling now forfeits {config?.cancellation_penalty_percent ?? 50}% of your fare.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
