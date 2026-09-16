// Thin wrapper around the pooled-pickup RPCs (see
// supabase/migrations/20260916100000_pooled_pickup.sql) so components don't
// call supabase.rpc(...) directly with untyped payloads scattered around the
// codebase. Mirrors the plain-function style of src/lib/stage-match.ts rather
// than wrapping everything in react-query, to match how the rest of the app
// talks to Supabase.

import { supabase } from "@/integrations/supabase/client";

export type PoolStatus = "forming" | "locked" | "dispatched" | "completed" | "collapsed";
export type PoolMemberStatus =
  | "pending"
  | "cancelled_free"
  | "cancelled_penalized"
  | "picked_up"
  | "dropped_by_backfill_failure";

export type PooledPickupConfig = {
  min_pool_size: number;
  max_pool_size: number;
  cluster_radius_meters: number;
  backfill_window_seconds: number;
  max_total_detour_seconds: number;
  max_avg_detour_seconds_per_passenger: number;
  cancellation_penalty_percent: number;
  base_pooling_surcharge: number;
  pooling_fee_floor: number;
  pooling_fee_ceiling: number;
};

export type PickupPool = {
  id: string;
  route_id: string;
  destination_stage_id: string;
  trip_id: string | null;
  status: PoolStatus;
  center_lat: number;
  center_lng: number;
  total_detour_seconds: number | null;
  total_detour_meters: number | null;
  efficiency_score: number | null;
  per_head_fee: number | null;
  formed_at: string | null;
  locked_at: string | null;
  dispatched_at: string | null;
  completed_at: string | null;
  collapsed_reason: string | null;
  created_at: string;
};

export type PickupPoolMember = {
  id: string;
  pool_id: string;
  passenger_id: string;
  booking_id: string | null;
  pin_lat: number;
  pin_lng: number;
  snapped_lat: number | null;
  snapped_lng: number | null;
  snap_distance_meters: number | null;
  sequence_order: number | null;
  status: PoolMemberStatus;
  fare_quote: number | null;
  fare_final: number | null;
  detour_seconds_contribution: number | null;
  joined_at: string;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  picked_up_at: string | null;
};

// Fetches the single tunable config row (min pool size, radius, fee bounds,
// etc.) so the UI can show live copy like "needs 2 more people" without
// hardcoding numbers that only exist in the DB.
export async function getPooledPickupConfig(): Promise<PooledPickupConfig | null> {
  const { data, error } = await supabase.from("pooled_pickup_config").select("*").single();
  if (error || !data) return null;
  return data as unknown as PooledPickupConfig;
}

// Passenger drops a pin + picks a destination stage on a route. Joins a
// nearby forming pool or starts a new one. Returns the pool id, or null on
// failure (e.g. RLS rejection, bad route/stage id).
export async function requestPooledPickup(params: {
  routeId: string;
  destinationStageId: string;
  pinLat: number;
  pinLng: number;
}): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase.rpc("request_pooled_pickup", {
    _passenger_id: user.id,
    _route_id: params.routeId,
    _destination_stage_id: params.destinationStageId,
    _pin_lat: params.pinLat,
    _pin_lng: params.pinLng,
  });
  if (error) {
    console.error("[pooled-pickup] request_pooled_pickup failed:", error.message);
    return null;
  }
  return data as string;
}

// Free before dispatch, forfeits cancellation_penalty_percent of the fare
// after — the DB function decides which applies based on the pool's status,
// so the client just calls this and shows whatever the resulting member
// status/reason communicates.
export async function cancelPoolMembership(memberId: string, reason?: string): Promise<boolean> {
  const { error } = await supabase.rpc("cancel_pool_membership", {
    _member_id: memberId,
    _reason: reason,
  });
  if (error) {
    console.error("[pooled-pickup] cancel_pool_membership failed:", error.message);
    return false;
  }
  return true;
}

export async function getPool(poolId: string): Promise<PickupPool | null> {
  const { data, error } = await supabase.from("pickup_pools").select("*").eq("id", poolId).single();
  if (error || !data) return null;
  return data as unknown as PickupPool;
}

export async function getPoolMembers(poolId: string): Promise<PickupPoolMember[]> {
  const { data, error } = await supabase
    .from("pickup_pool_members")
    .select("*")
    .eq("pool_id", poolId)
    .order("joined_at", { ascending: true });
  if (error || !data) return [];
  return data as unknown as PickupPoolMember[];
}

// The passenger's own current pending pool membership, if any — used to
// restore the "you're in a pool, X/Y joined" view on reload instead of
// showing the pin-drop screen again.
export async function getMyActivePoolMembership(): Promise<PickupPoolMember | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("pickup_pool_members")
    .select("*")
    .eq("passenger_id", user.id)
    .eq("status", "pending")
    .order("joined_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as PickupPoolMember;
}

// Subscribes to both the pool row and its member rows so the UI updates live
// as people join/cancel/get dispatched, matching the postgres_changes pattern
// used elsewhere in the app (see ride.$routeId.tsx). Call the returned
// cleanup function in a useEffect teardown.
export function subscribeToPool(poolId: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`pickup-pool-${poolId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "pickup_pools", filter: `id=eq.${poolId}` },
      onChange,
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "pickup_pool_members",
        filter: `pool_id=eq.${poolId}`,
      },
      onChange,
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// ============== DRIVER SIDE ==============

export type DriverPoolPreferences = {
  driver_id: string;
  auto_accept_enabled: boolean;
  max_auto_accept_members: number | null;
  max_auto_accept_detour_seconds: number | null;
};

export async function getDriverPoolPreferences(): Promise<DriverPoolPreferences | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("driver_pool_preferences")
    .select("*")
    .eq("driver_id", user.id)
    .maybeSingle();
  if (error) return null;
  return (data as unknown as DriverPoolPreferences) ?? null;
}

export async function setDriverAutoAccept(params: {
  enabled: boolean;
  maxMembers?: number | null;
  maxDetourSeconds?: number | null;
}): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { error } = await supabase.from("driver_pool_preferences").upsert({
    driver_id: user.id,
    auto_accept_enabled: params.enabled,
    max_auto_accept_members: params.maxMembers ?? null,
    max_auto_accept_detour_seconds: params.maxDetourSeconds ?? null,
    updated_at: new Date().toISOString(),
  });
  return !error;
}

// Driver taps "Accept" on a locked pool that's been offered for their trip.
export async function dispatchPool(poolId: string, tripId: string): Promise<boolean> {
  const { error } = await supabase.rpc("dispatch_pool", { _pool_id: poolId, _trip_id: tripId });
  if (error) {
    console.error("[pooled-pickup] dispatch_pool failed:", error.message);
    return false;
  }
  return true;
}

export async function markPoolMemberPickedUp(memberId: string): Promise<boolean> {
  const { error } = await supabase.rpc("mark_pool_member_picked_up", { _member_id: memberId });
  return !error;
}

// Driver flags a pin as physically unreachable after trying to get to it.
export async function flagPickupPointInaccessible(params: {
  lat: number;
  lng: number;
  tripId?: string;
  poolMemberId?: string;
  reason?: string;
}): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { error } = await supabase.from("pickup_point_accessibility_flags").insert({
    lat: params.lat,
    lng: params.lng,
    flagged_by: user.id,
    trip_id: params.tripId ?? null,
    pool_member_id: params.poolMemberId ?? null,
    reason: params.reason ?? null,
  });
  return !error;
}

// Locked pools matched to a route that haven't been dispatched yet — this is
// what a driver's trip screen polls/subscribes to in order to offer detours.
export async function getLockedPoolsForRoute(routeId: string): Promise<PickupPool[]> {
  const { data, error } = await supabase
    .from("pickup_pools")
    .select("*")
    .eq("route_id", routeId)
    .eq("status", "locked")
    .order("locked_at", { ascending: true });
  if (error || !data) return [];
  return data as unknown as PickupPool[];
}
