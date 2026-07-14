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
  Package,
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
import { OnboardingGuide, useOnboardingSeen } from "@/components/matu/OnboardingGuide";
import { cacheGetAll, cacheReplaceAll, setLastSynced } from "@/lib/offline-cache";

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
  const onboardingSeen = useOnboardingSeen();
  const [showOnboarding, setShowOnboarding] = useState(false);
  useEffect(() => {
    if (!onboardingSeen) setShowOnboarding(true);
  }, [onboardingSeen]);
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
      const [{ data: r, error: rErr }, { data: s, error: sErr }] = await Promise.all([
        supabase.from("routes").select("id,name,origin,destination,base_fare").order("name"),
        supabase.from("stages").select("id,name,lat,lng,order_index,route_id").order("order_index"),
      ]);

      if (rErr || sErr) {
        // Network/Supabase call failed (most likely: offline). Fall back to
        // whatever we last cached instead of leaving the passenger with an
        // empty route list.
        const [cachedRoutes, cachedStages] = await Promise.all([
          cacheGetAll<RouteRow>("routes"),
          cacheGetAll<StageRow>("stages"),
        ]);
        setRoutes(cachedRoutes);
        setStages(cachedStages);
        setLoading(false);
        if (cachedRoutes.length === 0) {
          toast.error("Couldn't load routes and no offline copy is saved yet.");
        }
        return;
      }

      const freshRoutes = (r ?? []) as RouteRow[];
      const freshStages = (s ?? []) as StageRow[];
      setRoutes(freshRoutes);
      setStages(freshStages);
      setLoading(false);
      // Save this fetch as the new offline fallback for next time.
      cacheReplaceAll("routes", freshRoutes);
      cacheReplaceAll("stages", freshStages);
      setLastSynced("routes-stages");

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
        let bestDistanceMeters = Infinity;
        stages.forEach((s) => {
          const d = (s.lat - p.lat) ** 2 + (s.lng - p.lng) ** 2;
          if (d < bestD) {
            bestD = d;
            bestName = s.name;
            // Rough meters, just for the "that's far" sanity check below —
            // 1 degree of lat/lng is ~111km near the equator.
            bestDistanceMeters = Math.sqrt(d) * 111_000;
          }
        });
        if (bestName) {
          setFrom(bestName);
          // If GPS accuracy is poor (common indoors, or on desktop browsers that
          // fall back to coarse IP-based location) the "nearest stage" can be
          // wildly wrong and the same for every location. Flag it instead of
          // silently presenting a confident-looking wrong answer.
          const accuracy = pos.coords.accuracy ?? 0;
          if (accuracy > 500 || bestDistanceMeters > 3000) {
            toast.warning(
              `Pickup set to ${bestName}, but your location looks imprecise (±${Math.round(accuracy)}m). Double-check it, or type your stage manually.`,
              { id: "geo" },
            );
          } else {
            toast.success(`Pickup set to ${bestName}`, { id: "geo" });
          }
        } else {
          toast.error("Couldn't match your location to a stage. Type it in manually.", {
            id: "geo",
          });
        }
      },
      (err) => {
        // err.code 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT.
        const message =
          err.code === 1
            ? "Location permission denied. Enable it in your browser/phone settings."
            : "Could not get your location. Try again, or type your stage manually.";
        toast.error(message, { id: "geo" });
      },
      // maximumAge: 0 forces a fresh GPS read instead of possibly reusing a stale
      // cached position (which is how "use my location" can end up stuck reporting
      // the same stage no matter where you actually are).
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }

  return (
    <AppShell
      title="Where to?"
      subtitle="Pick pickup and destination. We'll match you to matatus on your route."
      tabs={[
        { to: "/ride", label: "Find a ride" },
        { to: "/ride/track", label: "Track" },
        { to: "/ride/history", label: "My bookings" },
        { to: "/parcel", label: "Send Parcel" },
      ]}
    >
      {showOnboarding && <OnboardingGuide onClose={() => setShowOnboarding(false)} />}
      <Link
        to="/parcel"
        className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-green-600 px-4 py-3 text-white shadow-sm transition hover:bg-green-700 active:bg-green-800"
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Package className="size-4" /> Sending a package? Get it delivered along a matatu route
        </span>
        <span className="rounded-md bg-white/20 px-3 py-1 text-xs font-bold">Send Parcel →</span>
      </Link>
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
            <button
              type="button"
              onClick={useMyLocation}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-4 text-base font-semibold text-primary-foreground shadow-soft transition hover:opacity-90"
            >
              <LocateFixed className="size-5" /> Use my location as pickup
            </button>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Easiest way to start. We'll find your nearest matatu stop automatically.
            </p>

            <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
              <div className="h-px flex-1 bg-border" />
              or type it in
              <div className="h-px flex-1 bg-border" />
            </div>

            <div className="grid gap-3">
              <PlaceField
                icon={<div className="size-2.5 rounded-full bg-accent" />}
                label="Pickup"
                value={from}
                onChange={setFrom}
                options={places}
                placeholder="Where from? (e.g. Utawala)"
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
              <p className="text-center text-xs text-muted-foreground">
                Matching matatus appear below as you type. No need to press search.
              </p>
              {(from || to) && (
                <button
                  type="button"
                  onClick={() => {
                    setFrom("");
                    setTo("");
                  }}
                  className="rounded-lg border border-border px-3 py-2.5 text-sm font-medium"
                >
                  Clear search
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowOnboarding(true)}
                className="text-xs text-primary underline underline-offset-2"
              >
                How this works
              </button>
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
                        No stage called "{to || from}". Nearest stop is{" "}
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
                          navigate({
                            to: "/ride/$routeId",
                            params: { routeId: r.id },
                            search: { from: from.trim() || undefined, to: to.trim() || undefined },
                          })
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
