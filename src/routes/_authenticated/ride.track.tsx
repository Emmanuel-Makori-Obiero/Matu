// FILE: src/routes/_authenticated/ride.track.tsx
// Standalone tracking page — deliberately separate from the booking flow (ride/$routeId).
// A passenger who hasn't booked (or doesn't want to) can still: pick a route, see every
// active vehicle on it moving live on the map, and "ping" a stage to tell the driver
// they're waiting there — reuses the same stage_pings mechanism the booking page uses.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bell, MapPin, Radio } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/matu/AppShell";
import { RouteMap, type MapStage, type MapVehicle } from "@/components/matu/RouteMap";
import { osrmDurationSeconds, mapboxTrafficDurationSeconds } from "@/lib/traffic-eta";
import { vehicleKindFromType } from "@/lib/vehicle-kind";

type RouteRow = { id: string; name: string; origin: string; destination: string };
type Stage = { id: string; name: string; lat: number; lng: number; order_index: number };
type Trip = { id: string; vehicle_id: string; status: string; current_stage_id: string | null };
type Vehicle = {
  id: string;
  plate_number: string;
  nickname: string | null;
  vehicle_type: string | null;
};
type TripLoc = { lat: number; lng: number; heading: number | null };

export const Route = createFileRoute("/_authenticated/ride/track")({
  // ?skip=1 arrives from the per-booking screen's "see all routes" link —
  // it means the passenger has already chosen to browse manually, so the
  // active-booking check below shouldn't just bounce them straight back.
  // Kept optional (omitted entirely when false) rather than always-present,
  // so links elsewhere into this route subtree — e.g. /ride/track/$bookingId
  // — aren't forced to also pass a `skip` value they don't care about.
  validateSearch: (search: Record<string, unknown>): { skip?: boolean } => {
    const skip = search.skip === "1" || search.skip === true;
    return skip ? { skip: true } : {};
  },
  component: TrackPage,
});

function TrackPage() {
  const navigate = useNavigate();
  const { skip } = Route.useSearch();
  // Starts true so the route picker doesn't flash on screen for the split
  // second before we know whether there's an active booking to jump into.
  const [checkingBooking, setCheckingBooking] = useState(!skip);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [routeId, setRouteId] = useState<string>("");
  const [stages, setStages] = useState<Stage[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [vehicles, setVehicles] = useState<Record<string, Vehicle>>({});
  const [tripLocs, setTripLocs] = useState<Record<string, TripLoc>>({});
  const [pingCounts, setPingCounts] = useState<Record<string, number>>({});
  const [myPingStageId, setMyPingStageId] = useState<string | null>(null);
  const [pinging, setPinging] = useState<string | null>(null);
  const [selfLoc, setSelfLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [showTraffic, setShowTraffic] = useState(true);

  // Same as the per-booking tracking screen — starts automatically, no button,
  // so the red "you" dot just appears if location is available/granted.
  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => setSelfLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => console.warn("[ride.track] geolocation unavailable:", err.message),
      { enableHighAccuracy: true, maximumAge: 10_000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // If the passenger already has a matatu confirmed or boarded, don't make
  // them pick a route at all — go straight to that trip's own tracking
  // screen (same map, just pre-scoped to their booking). Skipped entirely if
  // they arrived via "see all routes" (skip=1) from that very screen, so
  // there's no bounce-back loop.
  useEffect(() => {
    if (skip) {
      setCheckingBooking(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        if (!cancelled) setCheckingBooking(false);
        return;
      }
      const { data, error } = await supabase
        .from("bookings")
        .select("id,status,alighted_at,updated_at")
        .eq("passenger_id", u.user.id)
        // Include alighted/cancelled here too — not just confirmed/boarded.
        // Without this, the moment a driver ends or cancels a trip, this
        // query stops matching that booking at all, and a passenger who
        // reloads (or opens /ride/track fresh) gets silently bounced to the
        // generic "browse routes" view instead of the per-booking screen
        // that shows the trip summary + rating popup — exactly the bug
        // where nothing seems to happen except a bare status word.
        .in("status", ["confirmed", "boarded", "alighted", "cancelled"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (!error && data) {
        const isActive = data.status === "confirmed" || data.status === "boarded";
        // For a terminal booking, only redirect if it turned terminal
        // recently — otherwise a passenger visiting /ride/track days after
        // an old trip would keep getting bounced into a stale summary
        // screen instead of the route browser they actually opened this
        // page for.
        const terminalAt = data.alighted_at ?? data.updated_at;
        const recentlyTerminal =
          !isActive && !!terminalAt && Date.now() - new Date(terminalAt).getTime() < 15 * 60 * 1000;
        if (isActive || recentlyTerminal) {
          navigate({ to: "/ride/track/$bookingId", params: { bookingId: data.id }, replace: true });
          return;
        }
      }
      setCheckingBooking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [skip, navigate]);

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
      .select("id,vehicle_id,status,current_stage_id")
      .eq("route_id", routeId)
      .in("status", ["boarding", "in_transit"]);
    const t = (data ?? []) as Trip[];
    setTrips(t);
    const ids = [...new Set(t.map((x) => x.vehicle_id))];
    if (ids.length) {
      const { data: v } = await supabase
        .from("vehicles")
        .select("id,plate_number,nickname,vehicle_type")
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

  // Per-vehicle jam check: for each active trip, is the leg immediately ahead
  // of it (from its live position to the next stage past current_stage_id)
  // running noticeably slower than free-flow right now? Same "more than 2
  // minutes slower than free-flow" threshold the driver's own jam alert uses,
  // computed directly (not via useLiveTrafficEta, since that hook targets one
  // fixed destination — here there's a different "next stage" per trip and
  // the list of trips itself changes size, so a dynamic per-trip loop is used
  // instead of calling the hook N times).
  const [jammedTripIds, setJammedTripIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (trips.length === 0 || stages.length === 0) {
      setJammedTripIds(new Set());
      return;
    }
    let cancelled = false;
    const sortedStages = [...stages].sort((a, b) => a.order_index - b.order_index);
    const check = async () => {
      const results = await Promise.all(
        trips.map(async (t) => {
          const loc = tripLocs[t.id];
          if (!loc) return null;
          const current = sortedStages.find((s) => s.id === t.current_stage_id);
          const nextStage = current
            ? sortedStages.find((s) => s.order_index > current.order_index)
            : sortedStages[0];
          if (!nextStage) return null;
          const dest = { lat: nextStage.lat, lng: nextStage.lng };
          const [trafficSeconds, freeFlowSeconds] = await Promise.all([
            mapboxTrafficDurationSeconds(loc, dest),
            osrmDurationSeconds("driving", loc, dest),
          ]);
          const jammed =
            trafficSeconds != null &&
            freeFlowSeconds != null &&
            trafficSeconds - freeFlowSeconds > 120;
          return jammed ? t.id : null;
        }),
      );
      if (cancelled) return;
      setJammedTripIds(new Set(results.filter((id): id is string => id != null)));
    };
    check();
    const iv = setInterval(check, 10_000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trips, stages, tripLocs]);

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
      const baseLabel = v ? `${v.plate_number}${v.nickname ? ` · ${v.nickname}` : ""}` : "Matatu";
      return {
        id: t.id,
        lat: loc.lat,
        lng: loc.lng,
        heading: loc.heading,
        label: jammedTripIds.has(t.id) ? `${baseLabel} · ⚠ Jam ahead` : baseLabel,
        kind: vehicleKindFromType(v?.vehicle_type),
      } as MapVehicle;
    })
    .filter((v): v is MapVehicle => v != null);

  const tabs = [
    { to: "/ride", label: "Find a ride" },
    { to: "/ride/track", label: "Track" },
    { to: "/ride/history", label: "My bookings" },
  ];

  if (checkingBooking) {
    return (
      <AppShell
        title="Track"
        subtitle="Checking your bookings…"
        tabs={tabs}
        assistantContext={{ page: "passenger_tracking" }}
      >
        <p className="text-sm text-muted-foreground">Checking your bookings…</p>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Track"
      subtitle="See live matatus on a route and let the driver know you're waiting. No booking needed."
      tabs={tabs}
      assistantContext={{ page: "passenger_tracking" }}
    >
      <div className="grid gap-4">
        {skip && (
          <div className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
            Browsing all routes.{" "}
            <button
              type="button"
              onClick={() => navigate({ to: "/ride/track", search: {}, replace: true })}
              className="font-medium text-primary underline"
            >
              Check my active booking instead
            </button>
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
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
          <button
            type="button"
            onClick={() => setShowTraffic((v) => !v)}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium ${
              showTraffic
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-secondary"
            }`}
          >
            Traffic {showTraffic ? "on" : "off"}
          </button>
        </div>

        {jammedTripIds.size > 0 && (
          <div className="inline-flex w-fit items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-xs font-medium text-destructive">
            <span className="size-2 rounded-full bg-destructive" />
            Heavy traffic ahead of{" "}
            {jammedTripIds.size === 1 ? "one matatu" : `${jammedTripIds.size} matatus`} on this
            route
          </div>
        )}

        <RouteMap
          stages={mapStages}
          vehicles={mapVehicles}
          selfPosition={selfLoc}
          showTraffic={showTraffic}
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
