// FILE: src/routes/_authenticated/ride.track.$bookingId.tsx
// Full-page tracking view for a single booking. Reached by tapping a booking in
// "My bookings" — shows the vehicle's live position, how far it's travelled from
// the pickup stage so far, and how far remains to the drop-off stage, plus the
// road-snapped remaining-route line on the map.
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { ArrowLeft, Bus, MapPin, Navigation2, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/matu/AppShell";
import { RouteMap, type MapStage, type MapVehicle } from "@/components/matu/RouteMap";
import { LeaveNowBanner } from "@/components/matu/LeaveNowBanner";
import { osrmDurationSeconds, useLiveTrafficEta, type LatLng } from "@/lib/traffic-eta";

type BookingRow = {
  id: string;
  trip_id: string;
  seat_number: number | null;
  pickup_stage_id: string | null;
  dropoff_stage_id: string | null;
  status: string;
};
type TripRow = {
  id: string;
  fare: number;
  status: string;
  route_id: string;
  vehicle_id: string;
  driver_id: string;
};
type RouteRow = { id: string; name: string; origin: string; destination: string };
type VehicleRow = { id: string; plate_number: string; nickname: string | null; capacity: number };
type StageRow = { id: string; name: string; lat: number; lng: number; order_index?: number };
type TripLoc = { lat: number; lng: number; heading: number | null };

export const Route = createFileRoute("/_authenticated/ride/track/$bookingId")({
  component: TrackBooking,
});

// OSRM returns duration only via osrmDurationSeconds; for a one-off static distance
// (pickup -> dropoff, computed once and never refetched) we call OSRM directly here
// rather than pulling in the Mapbox traffic call, since traffic doesn't matter for
// a fixed reference distance.
async function osrmDistanceMeters(origin: LatLng, destination: LatLng): Promise<number | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=false`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as { routes?: Array<{ distance: number }> };
    return data.routes?.[0]?.distance ?? null;
  } catch {
    return null;
  }
}

function TrackBooking() {
  const { bookingId } = Route.useParams();
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState<BookingRow | null>(null);
  const [trip, setTrip] = useState<TripRow | null>(null);
  const [route, setRoute] = useState<RouteRow | null>(null);
  const [vehicle, setVehicle] = useState<VehicleRow | null>(null);
  const [pickup, setPickup] = useState<StageRow | null>(null);
  const [dropoff, setDropoff] = useState<StageRow | null>(null);
  const [routeStages, setRouteStages] = useState<StageRow[]>([]);
  const [vehicleLoc, setVehicleLoc] = useState<TripLoc | null>(null);
  const [totalMeters, setTotalMeters] = useState<number | null>(null);

  const [existingRating, setExistingRating] = useState<{
    rating: number;
    comment: string | null;
  } | null>(null);
  const [ratingLoading, setRatingLoading] = useState(true);
  const [ratingValue, setRatingValue] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const [submittingRating, setSubmittingRating] = useState(false);

  // Poll the trip's own status (separately from the one-time load above) so
  // that when the driver marks the trip "completed" from their screen, this
  // page picks it up on its own -- the passenger shouldn't have to manually
  // refresh to see the rating prompt appear.
  useEffect(() => {
    if (!trip || trip.status === "completed") return;
    const iv = setInterval(async () => {
      const { data } = await supabase
        .from("trips")
        .select("status")
        .eq("id", trip.id)
        .maybeSingle();
      if (data && data.status !== trip.status) {
        setTrip((prev) => (prev ? { ...prev, status: data.status } : prev));
      }
    }, 8000);
    return () => clearInterval(iv);
  }, [trip?.id, trip?.status]);

  // Once the trip is completed, check whether this booking already has a
  // rating -- shows "thanks, already rated" instead of the form if so.
  useEffect(() => {
    if (!trip || trip.status !== "completed" || !booking) {
      setRatingLoading(false);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("trip_ratings")
        .select("rating,comment")
        .eq("booking_id", booking.id)
        .maybeSingle();
      setExistingRating(data ?? null);
      setRatingLoading(false);
    })();
  }, [trip?.status, booking?.id]);

  async function submitRating() {
    if (!trip || !booking) return;
    if (ratingValue < 1) return toast.error("Tap a star to rate the trip.");
    setSubmittingRating(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      setSubmittingRating(false);
      return toast.error("Please sign in again to submit a rating.");
    }
    const { error } = await supabase.from("trip_ratings").insert({
      booking_id: booking.id,
      trip_id: trip.id,
      passenger_id: u.user.id,
      driver_id: trip.driver_id,
      rating: ratingValue,
      comment: ratingComment.trim() || null,
    });
    setSubmittingRating(false);
    if (error) return toast.error(error.message);
    setExistingRating({ rating: ratingValue, comment: ratingComment.trim() || null });
    toast.success("Thanks for rating your trip!");
  }

  // Load booking + trip + route + vehicle + stages once.
  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: b } = await supabase
        .from("bookings")
        .select("id,trip_id,seat_number,pickup_stage_id,dropoff_stage_id,status")
        .eq("id", bookingId)
        .maybeSingle();
      if (!b) {
        setLoading(false);
        return;
      }
      setBooking(b as BookingRow);

      const { data: t } = await supabase
        .from("trips")
        .select("id,fare,status,route_id,vehicle_id,driver_id")
        .eq("id", b.trip_id)
        .maybeSingle();
      if (t) setTrip(t as TripRow);

      const [{ data: r }, { data: v }] = await Promise.all([
        t
          ? supabase
              .from("routes")
              .select("id,name,origin,destination")
              .eq("id", t.route_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        t
          ? supabase
              .from("vehicles")
              .select("id,plate_number,nickname,capacity")
              .eq("id", t.vehicle_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      if (r) setRoute(r as RouteRow);
      if (v) setVehicle(v as VehicleRow);

      const stageIds = [b.pickup_stage_id, b.dropoff_stage_id].filter((x): x is string => !!x);
      if (stageIds.length) {
        const { data: s } = await supabase
          .from("stages")
          .select("id,name,lat,lng")
          .in("id", stageIds);
        const map: Record<string, StageRow> = {};
        (s ?? []).forEach((x: StageRow) => (map[x.id] = x));
        if (b.pickup_stage_id) setPickup(map[b.pickup_stage_id] ?? null);
        if (b.dropoff_stage_id) setDropoff(map[b.dropoff_stage_id] ?? null);
      }

      // Full ordered stage list for the route the trip runs on — this is what
      // lets the map draw the actual matatu route (all stops), not just a
      // straight line between the passenger's own pickup and drop-off.
      if (t) {
        const { data: rs } = await supabase
          .from("stages")
          .select("id,name,lat,lng,order_index")
          .eq("route_id", t.route_id)
          .order("order_index");
        setRouteStages((rs ?? []) as StageRow[]);
      }
      setLoading(false);
    })();
  }, [bookingId]);

  // Static reference distance: pickup -> dropoff. Computed once, used to derive
  // "distance covered" as (total - remaining).
  useEffect(() => {
    if (!pickup || !dropoff) return;
    let cancelled = false;
    (async () => {
      const meters = await osrmDistanceMeters(
        { lat: pickup.lat, lng: pickup.lng },
        { lat: dropoff.lat, lng: dropoff.lng },
      );
      if (!cancelled) setTotalMeters(meters);
    })();
    return () => {
      cancelled = true;
    };
  }, [pickup, dropoff]);

  // Poll the vehicle's live position.
  useEffect(() => {
    if (!trip) return;
    let cancelled = false;
    const fetchLoc = async () => {
      const { data } = await supabase.rpc("get_trip_location", { _trip_id: trip.id });
      const row = Array.isArray(data) ? data[0] : null;
      if (cancelled) return;
      if (row?.current_lat != null && row?.current_lng != null) {
        setVehicleLoc({
          lat: row.current_lat,
          lng: row.current_lng,
          heading: row.current_heading ?? null,
        });
      } else {
        setVehicleLoc(null);
      }
    };
    fetchLoc();
    const iv = setInterval(fetchLoc, 5000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [trip]);

  const destination = dropoff ? { lat: dropoff.lat, lng: dropoff.lng } : null;
  const {
    minutes: etaMinutes,
    delayed,
    error: etaError,
    distanceMeters: remainingMeters,
  } = useLiveTrafficEta(vehicleLoc, destination);

  const coveredMeters =
    totalMeters != null && remainingMeters != null
      ? Math.max(totalMeters - remainingMeters, 0)
      : null;
  const progressPct =
    totalMeters != null && coveredMeters != null && totalMeters > 0
      ? Math.min(100, Math.round((coveredMeters / totalMeters) * 100))
      : null;

  const mapStages: MapStage[] =
    routeStages.length > 0
      ? routeStages.map((s) => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng }))
      : [pickup, dropoff]
          .filter((s): s is StageRow => !!s)
          .map((s) => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng }));
  const mapVehicles: MapVehicle[] = vehicleLoc
    ? [
        {
          id: "tracked-vehicle",
          lat: vehicleLoc.lat,
          lng: vehicleLoc.lng,
          heading: vehicleLoc.heading,
          label: vehicle?.plate_number ?? "Matatu",
        },
      ]
    : [];

  if (loading) {
    return (
      <AppShell title="Tracking" subtitle="Loading your trip…">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </AppShell>
    );
  }

  if (!booking || !trip) {
    return (
      <AppShell title="Tracking" subtitle="This booking couldn't be found.">
        <Link
          to="/ride/history"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary"
        >
          <ArrowLeft className="size-4" /> Back to my bookings
        </Link>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={route?.name ?? "Your trip"}
      subtitle={`${pickup?.name ?? "—"} → ${dropoff?.name ?? "—"}`}
      assistantContext={{ page: "passenger_route_details" }}
    >
      <Link
        to="/ride/history"
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to my bookings
      </Link>

      <div className="grid gap-4">
        {/* Vehicle details */}
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4">
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
              <Bus className="size-5" />
            </span>
            <div>
              <div className="font-display text-sm font-semibold">
                {vehicle?.plate_number ?? "—"}
                {vehicle?.nickname ? ` · ${vehicle.nickname}` : ""}
              </div>
              <div className="text-xs text-muted-foreground">
                {vehicle?.capacity ? `${vehicle.capacity}-seater` : "—"}
                {booking.seat_number ? ` · Seat ${booking.seat_number}` : ""}
              </div>
            </div>
          </div>
          <span className="shrink-0 rounded-md bg-accent/30 px-2 py-1 text-xs font-medium capitalize text-accent-foreground">
            {trip.status.replace("_", " ")}
          </span>
        </div>

        {/* Rate the trip — shown once the driver marks it completed. One rating
            per booking; shows a thank-you instead of the form if already submitted. */}
        {trip.status === "completed" && !ratingLoading && (
          <div className="rounded-2xl border border-border bg-surface p-5">
            {existingRating ? (
              <div className="text-center">
                <p className="font-display text-base font-semibold">Thanks for rating your trip!</p>
                <div className="mt-2 flex justify-center gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star
                      key={n}
                      className={`size-6 ${
                        n <= existingRating.rating
                          ? "fill-amber-400 text-amber-400"
                          : "text-muted-foreground"
                      }`}
                    />
                  ))}
                </div>
                {existingRating.comment && (
                  <p className="mt-2 text-sm text-muted-foreground">“{existingRating.comment}”</p>
                )}
              </div>
            ) : (
              <div>
                <h2 className="font-display text-lg font-semibold">How was your trip?</h2>
                <p className="text-xs text-muted-foreground">
                  Rate your matatu ride — Kadiria safari yako
                </p>
                <div className="mt-3 flex justify-center gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} onClick={() => setRatingValue(n)} aria-label={`Rate ${n} star`}>
                      <Star
                        className={`size-9 transition-colors ${
                          n <= ratingValue
                            ? "fill-amber-400 text-amber-400"
                            : "text-muted-foreground"
                        }`}
                      />
                    </button>
                  ))}
                </div>
                <textarea
                  value={ratingComment}
                  onChange={(e) => setRatingComment(e.target.value)}
                  placeholder="Anything you want to add? (optional)"
                  rows={2}
                  className="mt-3 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
                <button
                  onClick={submitRating}
                  disabled={submittingRating}
                  className="mt-3 w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                >
                  {submittingRating ? "Submitting…" : "Submit rating"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* When to leave for pickup — shown until the passenger boards, reusing the same
            hook-driven banner from the booking screen so the number never disagrees with
            it. Only meaningful before boarding; once boarded there's no "leave now" to give. */}
        {pickup && trip.status !== "completed" && booking.status !== "boarded" && (
          <LeaveNowBanner
            busPos={vehicleLoc}
            stage={{ lat: pickup.lat, lng: pickup.lng, name: pickup.name }}
          />
        )}

        {/* Map — always shown so the route (all stages on this trip) is visible even
            before the driver's live GPS arrives; the vehicle marker/live route line
            just won't appear yet in that case. */}
        <RouteMap
          stages={mapStages}
          vehicles={mapVehicles}
          liveRoute={vehicleLoc && destination ? { origin: vehicleLoc, destination } : null}
          onLiveRouteStaleChange={(stale) => {
            if (stale)
              toast.error("Live route couldn't refresh — the line on the map may be outdated.");
          }}
          className="h-[380px] w-full rounded-2xl border border-border"
        />
        {!vehicleLoc && (
          <p className="-mt-2 text-center text-xs text-muted-foreground">
            Waiting for the driver's live location…
          </p>
        )}

        {/* Distance covered / remaining */}
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3" /> {pickup?.name ?? "Pickup"}
            </span>
            <span className="inline-flex items-center gap-1">
              {dropoff?.name ?? "Drop-off"} <MapPin className="size-3" />
            </span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progressPct ?? 0}%` }}
            />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-center">
            <div>
              <div className="font-display text-lg font-semibold">
                {coveredMeters != null ? `${(coveredMeters / 1000).toFixed(1)} km` : "—"}
              </div>
              <div className="text-xs text-muted-foreground">Covered</div>
            </div>
            <div>
              <div className="font-display text-lg font-semibold">
                {remainingMeters != null ? `${(remainingMeters / 1000).toFixed(1)} km` : "—"}
              </div>
              <div className="text-xs text-muted-foreground">Remaining</div>
            </div>
          </div>
          {etaMinutes != null && (
            <div className="mt-3 flex items-center justify-center gap-1 text-xs font-medium text-primary">
              <Navigation2 className="size-3.5" /> Arriving in {etaMinutes} min
              {delayed && <span className="font-medium text-amber-600"> · delayed by traffic</span>}
            </div>
          )}
          {etaMinutes == null && etaError && vehicleLoc && (
            <div className="mt-3 flex items-center justify-center gap-1 text-xs font-medium text-muted-foreground">
              <Navigation2 className="size-3.5" /> Live ETA unavailable
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
