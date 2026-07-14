// FILE: src/routes/_authenticated/ride.track.tsx
// Standalone tracking page — deliberately separate from the booking flow (ride/$routeId).
// A passenger who hasn't booked (or doesn't want to) can still: pick a route, see every
// active vehicle on it moving live on the map, and "ping" a stage to tell the driver
// they're waiting there — reuses the same stage_pings mechanism the booking page uses.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bell, MapPin, Radio } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/matu/AppShell";
import { RouteMap, type MapStage, type MapVehicle } from "@/components/matu/RouteMap";

type RouteRow = { id: string; name: string; origin: string; destination: string };
type Stage = { id: string; name: string; lat: number; lng: number; order_index: number };
type Trip = { id: string; vehicle_id: string; status: string };
type Vehicle = { id: string; plate_number: string; nickname: string | null };
type TripLoc = { lat: number; lng: number; heading: number | null };

export const Route = createFileRoute("/_authenticated/ride/track")({
  component: TrackPage,
});

function TrackPage() {
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [routeId, setRouteId] = useState<string>("");
  const [stages, setStages] = useState<Stage[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [vehicles, setVehicles] = useState<Record<string, Vehicle>>({});
  const [tripLocs, setTripLocs] = useState<Record<string, TripLoc>>({});
  const [pingCounts, setPingCounts] = useState<Record<string, number>>({});
  const [myPingStageId, setMyPingStageId] = useState<string | null>(null);
  const [pinging, setPinging] = useState<string | null>(null);

  // Load every route once, for the picker.
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("routes")
        .select("id,name,origin,destination")
        .order("name");
      const r = (data ?? []) as RouteRow[];
      setRoutes(r);
      if (r.length > 0) setRouteId(r[0].id);
    })();
  }, []);

  // Stages for the selected route.
  useEffect(() => {
    if (!routeId) return;
    (async () => {
      const { data } = await supabase
        .from("stages")
        .select("id,name,lat,lng,order_index")
        .eq("route_id", routeId)
        .order("order_index");
      setStages((data ?? []) as Stage[]);
    })();
  }, [routeId]);

  // Active trips (+ vehicles) on the selected route, kept live via realtime.
  async function loadTrips() {
    if (!routeId) return;
    const { data } = await supabase
      .from("trips")
      .select("id,vehicle_id,status")
      .eq("route_id", routeId)
      .in("status", ["boarding", "in_transit"]);
    const t = (data ?? []) as Trip[];
    setTrips(t);
    const ids = [...new Set(t.map((x) => x.vehicle_id))];
    if (ids.length) {
      const { data: v } = await supabase
        .from("vehicles")
        .select("id,plate_number,nickname")
        .in("id", ids);
      const map: Record<string, Vehicle> = {};
      (v ?? []).forEach((x: Vehicle) => (map[x.id] = x));
      setVehicles(map);
    } else {
      setVehicles({});
    }
  }

  useEffect(() => {
    if (!routeId) return;
    loadTrips();
    const ch = supabase
      .channel(`track-trips-${routeId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trips", filter: `route_id=eq.${routeId}` },
        () => loadTrips(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId]);

  // Poll live positions for every active trip on this route.
  useEffect(() => {
    if (trips.length === 0) {
      setTripLocs({});
      return;
    }
    let cancelled = false;
    const fetchAll = async () => {
      const entries = await Promise.all(
        trips.map(async (t) => {
          const { data } = await supabase.rpc("get_trip_location", { _trip_id: t.id });
          const row = Array.isArray(data) ? data[0] : null;
          if (row?.current_lat != null && row?.current_lng != null) {
            return [
              t.id,
              { lat: row.current_lat, lng: row.current_lng, heading: row.current_heading ?? null },
            ] as const;
          }
          return null;
        }),
      );
      if (cancelled) return;
      const next: Record<string, TripLoc> = {};
      entries.forEach((e) => {
        if (e) next[e[0]] = e[1];
      });
      setTripLocs(next);
    };
    fetchAll();
    const iv = setInterval(fetchAll, 5000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [trips]);

  // Demand signal: same stage_pings mechanism as the booking page — lets the driver
  // see people waiting even though nobody here has booked a seat.
  async function loadPingCounts() {
    if (!routeId) return;
    const { data } = await supabase.rpc("get_stage_ping_counts", { _route_id: routeId });
    const counts: Record<string, number> = {};
    (data ?? []).forEach((r: { stage_id: string; waiting_count: number }) => {
      counts[r.stage_id] = Number(r.waiting_count);
    });
    setPingCounts(counts);
  }

  useEffect(() => {
    if (!routeId) return;
    setMyPingStageId(null);
    loadPingCounts();
    const ch = supabase
      .channel(`track-stage-pings-${routeId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stage_pings", filter: `route_id=eq.${routeId}` },
        () => loadPingCounts(),
      )
      .subscribe();
    const iv = setInterval(loadPingCounts, 20_000);
    return () => {
      supabase.removeChannel(ch);
      clearInterval(iv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId]);

  async function notifyDriver(stageId: string) {
    setPinging(stageId);
    const { error } = await supabase.rpc("ping_stage", { _stage_id: stageId });
    setPinging(null);
    if (error) return toast.error(error.message);
    setMyPingStageId(stageId);
    toast.success("Driver notified. You're marked as waiting here.");
    loadPingCounts();
  }

  const mapStages: MapStage[] = stages.map((s) => ({
    id: s.id,
    name: s.name,
    lat: s.lat,
    lng: s.lng,
  }));
  const mapVehicles: MapVehicle[] = trips
    .map((t) => {
      const loc = tripLocs[t.id];
      if (!loc) return null;
      const v = vehicles[t.vehicle_id];
      return {
        id: t.id,
        lat: loc.lat,
        lng: loc.lng,
        heading: loc.heading,
        label: v ? `${v.plate_number}${v.nickname ? ` · ${v.nickname}` : ""}` : "Matatu",
      } as MapVehicle;
    })
    .filter((v): v is MapVehicle => v != null);

  return (
    <AppShell
      title="Track"
      subtitle="See live matatus on a route and let the driver know you're waiting. No booking needed."
      tabs={[
        { to: "/ride", label: "Find a ride" },
        { to: "/ride/track", label: "Track" },
        { to: "/ride/history", label: "My bookings" },
      ]}
      assistantContext={{ page: "passenger_route_details" }}
    >
      <div className="grid gap-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Route</label>
          <select
            value={routeId}
            onChange={(e) => setRouteId(e.target.value)}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm sm:w-96"
          >
            {routes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.origin} → {r.destination})
              </option>
            ))}
          </select>
        </div>

        <RouteMap
          stages={mapStages}
          vehicles={mapVehicles}
          className="h-[420px] w-full rounded-2xl border border-border"
        />

        {mapVehicles.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No matatus are currently active on this route.
          </p>
        )}

        <div>
          <h2 className="font-display text-sm font-semibold">Notify the driver you're waiting</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Tap your stage so drivers on this route can see demand building, even without a booking.
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {stages.map((s) => {
              const waiting = pingCounts[s.id] ?? 0;
              const isMine = myPingStageId === s.id;
              return (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface p-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1 text-sm font-medium">
                      <MapPin className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{s.name}</span>
                    </div>
                    {waiting > 0 && (
                      <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Radio className="size-3" /> {waiting} waiting here
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => notifyDriver(s.id)}
                    disabled={pinging === s.id}
                    className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium disabled:opacity-60 ${
                      isMine
                        ? "bg-primary/15 text-primary"
                        : "border border-border hover:bg-secondary"
                    }`}
                  >
                    <Bell className="size-3" /> {isMine ? "Notified" : "I'm here"}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </AppShell>
  );
}
