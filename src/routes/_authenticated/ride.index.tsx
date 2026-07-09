import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  MapPin,
  Bus,
  Search,
  ArrowRightLeft,
  LocateFixed,
  Navigation,
  Star,
  MapPinned,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/matu/AppShell";
import { RouteMap, type MapStage } from "@/components/matu/RouteMap";
import {
  findNearestStage,
  findNearestStageByCoords,
  type NearestStageResult,
} from "@/lib/stage-match";

type RouteRow = {
  id: string;
  name: string;
  origin: string;
  destination: string;
  base_fare: number | null;
};
type StageRow = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  order_index: number;
  route_id: string;
};

export const Route = createFileRoute("/_authenticated/ride/")({
  component: PassengerHome,
});

function PassengerHome() {
  const navigate = useNavigate();
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [stages, setStages] = useState<StageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [myLoc, setMyLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [nearestSuggestions, setNearestSuggestions] = useState<NearestStageResult[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [pickTarget, setPickTarget] = useState<"from" | "to">("from");
  const [droppedPin, setDroppedPin] = useState<{ lat: number; lng: number } | null>(null);
  const [pickingOnMap, setPickingOnMap] = useState(false);

  async function handleMapClick(lat: number, lng: number) {
    if (!pickingOnMap) return;
    setDroppedPin({ lat, lng });
    const matches = await findNearestStageByCoords(lat, lng, 1);
    if (matches.length === 0) return toast.error("No nearby stage found for that spot");
    const nearest = matches[0];
    if (pickTarget === "from") setFrom(nearest.stage.name);
    else setTo(nearest.stage.name);
    const distanceLabel =
      nearest.distanceKm < 0.05 ? "right there" : `${nearest.distanceKm.toFixed(1)} km away`;
    toast.success(
      `${pickTarget === "from" ? "Pickup" : "Destination"} set to ${nearest.stage.name} (nearest stage, ${distanceLabel})`,
    );
  }

  useEffect(() => {
    (async () => {
      const [{ data: r }, { data: s }] = await Promise.all([
        supabase.from("routes").select("id,name,origin,destination,base_fare").order("name"),
        supabase.from("stages").select("id,name,lat,lng,order_index,route_id").order("order_index"),
      ]);
      setRoutes((r ?? []) as RouteRow[]);
      setStages((s ?? []) as StageRow[]);
      setLoading(false);

      const { data: u } = await supabase.auth.getUser();
      if (u.user) {
        const { data: favs } = await supabase
          .from("favorite_routes")
          .select("route_id")
          .eq("passenger_id", u.user.id);
        setFavoriteIds(new Set((favs ?? []).map((f) => f.route_id)));
      }
    })();
  }, []);

  async function toggleFavorite(routeId: string) {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return toast.error("Sign in to save favorite routes");
    const isFav = favoriteIds.has(routeId);
    // Optimistic update — feels instant, and we roll back on error below.
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      isFav ? next.delete(routeId) : next.add(routeId);
      return next;
    });
    if (isFav) {
      const { error } = await supabase
        .from("favorite_routes")
        .delete()
        .eq("passenger_id", u.user.id)
        .eq("route_id", routeId);
      if (error) {
        setFavoriteIds((prev) => new Set(prev).add(routeId));
        toast.error("Could not remove favorite");
      }
    } else {
      const { error } = await supabase
        .from("favorite_routes")
        .insert({ passenger_id: u.user.id, route_id: routeId });
      if (error) {
        setFavoriteIds((prev) => {
          const next = new Set(prev);
          next.delete(routeId);
          return next;
        });
        toast.error("Could not save favorite");
      }
    }
  }

  const places = useMemo(() => {
    const s = new Set<string>();
    routes.forEach((r) => {
      s.add(r.origin);
      s.add(r.destination);
    });
    stages.forEach((st) => s.add(st.name));
    return Array.from(s).sort();
  }, [routes, stages]);

  const filtered = useMemo(() => {
    const f = from.trim().toLowerCase();
    const t = to.trim().toLowerCase();
    const base =
      !f && !t
        ? routes
        : routes.filter((r) => {
            const o = r.origin.toLowerCase();
            const d = r.destination.toLowerCase();
            const routeStages = stages
              .filter((s) => s.route_id === r.id)
              .map((s) => s.name.toLowerCase());
            const hay = [o, d, ...routeStages].join(" | ");
            const matchesF = !f || hay.includes(f);
            const matchesT = !t || hay.includes(t);
            return matchesF && matchesT;
          });
    // Favorited routes float to the top so regular riders can jump straight to their
    // usual route instead of re-searching every time.
    return [...base].sort((a, b) => {
      const aFav = favoriteIds.has(a.id) ? 1 : 0;
      const bFav = favoriteIds.has(b.id) ? 1 : 0;
      return bFav - aFav;
    });
  }, [routes, stages, from, to, favoriteIds]);

  // If nothing matches what the passenger typed, look up the nearest real stage
  // instead of just saying "no results".
  useEffect(() => {
    const query = (to || from).trim();
    if (filtered.length > 0 || !query) {
      setNearestSuggestions([]);
      return;
    }
    let cancelled = false;
    findNearestStage(query).then((matches) => {
      if (!cancelled) setNearestSuggestions(matches);
    });
    return () => {
      cancelled = true;
    };
  }, [filtered.length, to, from]);

  // Stages shown on map: from filtered routes (or all if nothing filtered)
  const mapStages: MapStage[] = useMemo(() => {
    const routeIds = new Set(filtered.map((r) => r.id));
    return stages
      .filter((s) => routeIds.has(s.route_id))
      .map((s) => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng }));
  }, [filtered, stages]);

  async function useMyLocation() {
    if (!("geolocation" in navigator)) return toast.error("Location not available");
    toast.loading("Getting your location…", { id: "geo" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setMyLoc(p);
        // Find nearest stage name to prefill From
        let bestName: string | null = null;
        let bestD = Infinity;
        stages.forEach((s) => {
          const d = (s.lat - p.lat) ** 2 + (s.lng - p.lng) ** 2;
          if (d < bestD) {
            bestD = d;
            bestName = s.name;
          }
        });
        if (bestName) setFrom(bestName);
        toast.success(`Pickup set to ${bestName ?? "your location"}`, { id: "geo" });
      },
      () => toast.error("Could not get location", { id: "geo" }),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <AppShell
      title="Where to?"
      subtitle="Pick pickup and destination — we'll match you to matatus on your route."
      tabs={[
        { to: "/ride", label: "Find a ride" },
        { to: "/ride/history", label: "My bookings" },
      ]}
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        {/* Map (left) */}
        <div className="order-2 lg:order-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setPickingOnMap((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium ${
                pickingOnMap
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-secondary"
              }`}
            >
              <MapPinned className="size-3.5" />
              {pickingOnMap ? "Tap the map to set location" : "Pick location on map"}
            </button>
            {pickingOnMap && (
              <div className="inline-flex overflow-hidden rounded-md border border-border text-xs">
                <button
                  type="button"
                  onClick={() => setPickTarget("from")}
                  className={`px-2.5 py-1.5 font-medium ${pickTarget === "from" ? "bg-accent/30 text-accent-foreground" : "text-muted-foreground"}`}
                >
                  Setting pickup
                </button>
                <button
                  type="button"
                  onClick={() => setPickTarget("to")}
                  className={`px-2.5 py-1.5 font-medium ${pickTarget === "to" ? "bg-primary/20 text-primary" : "text-muted-foreground"}`}
                >
                  Setting destination
                </button>
              </div>
            )}
          </div>
          <RouteMap
            stages={mapStages}
            vehicles={myLoc ? [{ id: "me", lat: myLoc.lat, lng: myLoc.lng, label: "You" }] : []}
            pin={droppedPin}
            onMapClick={handleMapClick}
            className={`h-[420px] w-full rounded-2xl border lg:h-[600px] ${pickingOnMap ? "border-primary" : "border-border"}`}
          />
        </div>

        {/* Form + results (right) */}
        <aside className="order-1 flex flex-col gap-4 lg:order-2">
          <section className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
            <div className="grid gap-3">
              <PlaceField
                icon={<div className="size-2.5 rounded-full bg-accent" />}
                label="Pickup"
                value={from}
                onChange={setFrom}
                options={places}
                placeholder="Where from? (e.g. Utawala)"
                rightSlot={
                  <button
                    type="button"
                    onClick={useMyLocation}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium hover:bg-secondary"
                  >
                    <LocateFixed className="size-3" /> Use my location
                  </button>
                }
              />
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => {
                    const a = from;
                    setFrom(to);
                    setTo(a);
                  }}
                  aria-label="Swap"
                  className="rounded-full border border-border bg-background p-1.5 hover:bg-secondary"
                >
                  <ArrowRightLeft className="size-3.5" />
                </button>
              </div>
              <PlaceField
                icon={<div className="size-2.5 rounded-full bg-primary" />}
                label="Destination"
                value={to}
                onChange={setTo}
                options={places}
                placeholder="Where to? (e.g. CBD)"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
                >
                  <Search className="mr-1 inline size-4" /> Find matatus
                </button>
                {(from || to) && (
                  <button
                    type="button"
                    onClick={() => {
                      setFrom("");
                      setTo("");
                    }}
                    className="rounded-lg border border-border px-3 py-2.5 text-xs"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold">
                {from || to
                  ? `Matching routes (${filtered.length})`
                  : `All routes (${routes.length})`}
              </h2>
            </div>
            {loading ? (
              <p className="mt-3 text-sm text-muted-foreground">Loading routes…</p>
            ) : filtered.length === 0 ? (
              <div className="mt-3 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                <p>No routes match. Try a nearby stage or clear the search.</p>
                {nearestSuggestions.length > 0 && (
                  <div className="mt-3">
                    {!nearestSuggestions[0].exactNameMatch && (
                      <p className="text-xs">
                        No stage called "{to || from}" — nearest stop is{" "}
                        <strong>{nearestSuggestions[0].stage.name}</strong> (
                        {nearestSuggestions[0].distanceKm.toFixed(1)} km away)
                      </p>
                    )}
                    <ul className="mt-2 grid gap-1.5">
                      {nearestSuggestions.map((m) => (
                        <li key={m.stage.id}>
                          <button
                            type="button"
                            onClick={() => (to ? setTo(m.stage.name) : setFrom(m.stage.name))}
                            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-left text-xs hover:border-primary"
                          >
                            {m.stage.name}
                            {!m.exactNameMatch &&
                              ` · ${m.distanceKm.toFixed(1)} km from "${to || from}"`}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <ul className="mt-3 grid max-h-[440px] gap-2 overflow-y-auto pr-1">
                {filtered.map((r) => {
                  const routeStages = stages
                    .filter((s) => s.route_id === r.id)
                    .sort((a, b) => a.order_index - b.order_index);
                  const fLow = from.trim().toLowerCase();
                  const tLow = to.trim().toLowerCase();
                  const findIdx = (q: string) =>
                    routeStages.findIndex((s) => s.name.toLowerCase().includes(q));
                  let fromIdx = fLow ? findIdx(fLow) : -1;
                  let toIdx = tLow ? findIdx(tLow) : -1;
                  if (fromIdx > -1 && toIdx > -1 && fromIdx > toIdx)
                    [fromIdx, toIdx] = [toIdx, fromIdx];
                  const between =
                    fromIdx > -1 && toIdx > -1
                      ? routeStages.slice(fromIdx, toIdx + 1)
                      : routeStages;
                  const showBetween = (fLow || tLow) && between.length > 0;
                  return (
                    <li key={r.id} className="relative">
                      <button
                        onClick={() =>
                          navigate({ to: "/ride/$routeId", params: { routeId: r.id } })
                        }
                        className="flex w-full items-start justify-between gap-3 rounded-xl border border-border bg-background p-3 pr-10 text-left transition hover:border-primary"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-display text-sm font-semibold">
                            {r.name}
                          </div>
                          <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                            <MapPin className="size-3 shrink-0" />
                            <span className="truncate">
                              {r.origin} → {r.destination}
                            </span>
                          </div>
                          {showBetween && (
                            <ol className="mt-2 grid gap-0.5 border-l-2 border-primary/40 pl-2 text-[11px] text-muted-foreground">
                              {between.map((s, i) => (
                                <li key={s.id} className="flex items-center gap-1">
                                  <span
                                    className={`size-1.5 rounded-full ${i === 0 ? "bg-accent" : i === between.length - 1 ? "bg-primary" : "bg-muted-foreground/50"}`}
                                  />
                                  <span className="truncate">{s.name}</span>
                                </li>
                              ))}
                            </ol>
                          )}
                        </div>
                        <div className="shrink-0 rounded-md bg-accent/30 px-2 py-1 text-xs font-semibold text-accent-foreground">
                          KSh {r.base_fare ?? "—"}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(r.id);
                        }}
                        aria-label={
                          favoriteIds.has(r.id) ? "Remove from favorites" : "Save as favorite"
                        }
                        className="absolute right-2 top-2 rounded-full p-1 hover:bg-secondary"
                      >
                        <Star
                          className={`size-4 ${favoriteIds.has(r.id) ? "fill-accent text-accent" : "text-muted-foreground"}`}
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <Link to="/ride" className="mt-3 inline-flex items-center gap-1 text-xs text-primary">
              <Navigation className="size-3" /> Browse all routes
            </Link>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}

function PlaceField({
  label,
  value,
  onChange,
  options,
  placeholder,
  icon,
  rightSlot,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  icon?: React.ReactNode;
  rightSlot?: React.ReactNode;
}) {
  const listId = `places-${label.toLowerCase()}`;
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <span className="flex items-center gap-2">
          {icon} {label}
        </span>
        {rightSlot}
      </span>
      <input
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none ring-ring focus:ring-2"
      />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </label>
  );
}

// Bus icon kept in imports intentionally for future use
void Bus;
