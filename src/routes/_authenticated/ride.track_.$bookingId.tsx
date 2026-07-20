// FILE: src/routes/_authenticated/ride.track.$bookingId.tsx
// Per-booking tracking screen — shown after ride.track.tsx finds an active
// booking and redirects here. Mirrors what the driver sees on drive.trip.tsx:
// the vehicle's live position, the actual road-snapped remaining route
// (colored red/amber/green by real congestion, not just a straight line),
// and a jam banner with a traffic-aware ETA — just from the passenger's seat
// instead of the driver's.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/matu/AppShell";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { RouteMap, type MapStage, type MapVehicle } from "@/components/matu/RouteMap";
import { TripSummary } from "@/components/matu/TripSummary";
import { vehicleKindFromType } from "@/lib/vehicle-kind";
import { useLiveTrafficEta } from "@/lib/traffic-eta";
import { fetchCongestionRoute, type CongestionSegment } from "@/lib/route-congestion";

type Booking = {
  id: string;
  trip_id: string;
  status: string;
  pickup_stage_id: string | null;
  dropoff_stage_id: string | null;
  cancellation_reason: string | null;
  boarded_at: string | null;
  alighted_at: string | null;
  fare_paid: number | null;
};
type Trip = {
  id: string;
  route_id: string;
  vehicle_id: string;
  status: string;
  driver_id: string;
  fare: number;
  started_at: string | null;
  ended_at: string | null;
};
type RouteRow = { id: string; name: string; origin: string; destination: string };
type Stage = { id: string; name: string; lat: number; lng: number; order_index: number };
type Vehicle = {
  id: string;
  plate_number: string;
  nickname: string | null;
  vehicle_type: string | null;
};
type TripLoc = { lat: number; lng: number; heading: number | null };

const STATUS_LABEL: Record<string, string> = {
  reserved: "Reserved — pay to confirm your seat",
  confirmed: "Confirmed — matatu is on the way",
  boarded: "You're on board",
  alighted: "Trip complete",
  cancelled: "Booking cancelled",
};

export const Route = createFileRoute("/_authenticated/ride/track_/$bookingId")({
  component: BookingTrackPage,
});

function BookingTrackPage() {
  const { bookingId } = Route.useParams();
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [routeInfo, setRouteInfo] = useState<RouteRow | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [tripLoc, setTripLoc] = useState<TripLoc | null>(null);
  const [selfLoc, setSelfLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [showTraffic, setShowTraffic] = useState(true);
  const [congestionRoute, setCongestionRoute] = useState<CongestionSegment[] | null>(null);
  const [showEndedPopup, setShowEndedPopup] = useState(false);

  // Load the booking → trip → route → stages → vehicle chain once. RLS on
  // "bookings" already scopes this to rows the signed-in passenger (or the
  // trip's driver, or a platform admin) is allowed to see, so a stranger's
  // bookingId in the URL just comes back empty rather than leaking data.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setNotFound(false);
      const { data: b } = await supabase
        .from("bookings")
        .select(
          "id,trip_id,status,pickup_stage_id,dropoff_stage_id,cancellation_reason,boarded_at,alighted_at,fare_paid",
        )
        .eq("id", bookingId)
        .maybeSingle();
      if (cancelled) return;
      if (!b) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setBooking(b as Booking);

      const { data: t } = await supabase
        .from("trips")
        .select("id,route_id,vehicle_id,status,driver_id,fare,started_at,ended_at")
        .eq("id", b.trip_id)
        .maybeSingle();
      if (cancelled) return;
      if (!t) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setTrip(t as Trip);

      const [{ data: r }, { data: s }, { data: v }] = await Promise.all([
        supabase
          .from("routes")
          .select("id,name,origin,destination")
          .eq("id", t.route_id)
          .maybeSingle(),
        supabase
          .from("stages")
          .select("id,name,lat,lng,order_index")
          .eq("route_id", t.route_id)
          .order("order_index"),
        supabase
          .from("vehicles")
          .select("id,plate_number,nickname,vehicle_type")
          .eq("id", t.vehicle_id)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      setRouteInfo((r ?? null) as RouteRow | null);
      setStages((s ?? []) as Stage[]);
      setVehicle((v ?? null) as Vehicle | null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  // Live vehicle position, refreshed on an interval — same cadence as the
  // driver's own broadcast and the generic track page.
  useEffect(() => {
    if (!trip) return;
    let cancelled = false;
    const fetchLoc = async () => {
      const { data } = await supabase.rpc("get_trip_location", { _trip_id: trip.id });
      if (cancelled) return;
      const row = Array.isArray(data) ? data[0] : null;
      if (row?.current_lat != null && row?.current_lng != null) {
        setTripLoc({
          lat: row.current_lat,
          lng: row.current_lng,
          heading: row.current_heading ?? null,
        });
      }
    };
    fetchLoc();
    const iv = setInterval(fetchLoc, 5000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [trip]);

  // Keep the trip and booking rows fresh via realtime — e.g. the status
  // banner should flip to "You're on board" the moment the driver marks it,
  // without the passenger needing to reload.
  useEffect(() => {
    if (!trip) return;
    const ch = supabase
      .channel(`track-booking-${bookingId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "trips", filter: `id=eq.${trip.id}` },
        (payload) =>
          setTrip((prev) => (prev ? { ...prev, ...(payload.new as Partial<Trip>) } : prev)),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "bookings", filter: `id=eq.${bookingId}` },
        (payload) =>
          setBooking((prev) => (prev ? { ...prev, ...(payload.new as Partial<Booking>) } : prev)),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip?.id, bookingId]);

  // Belt-and-suspenders fallback: poll the booking's own status every few
  // seconds regardless of whether realtime is delivering events. Realtime
  // requires the table to be added to the supabase_realtime publication
  // (see the accompanying migration) — if that's ever missing, misconfigured,
  // or just slow to reconnect, this polling loop still catches the status
  // flip within a few seconds instead of requiring a manual reload. Stops
  // once the booking reaches a terminal state, so it doesn't poll forever
  // after the trip summary is already showing.
  useEffect(() => {
    if (!booking) return;
    if (booking.status === "alighted" || booking.status === "cancelled") return;
    const iv = setInterval(async () => {
      const { data } = await supabase
        .from("bookings")
        .select(
          "id,trip_id,status,pickup_stage_id,dropoff_stage_id,cancellation_reason,boarded_at,alighted_at,fare_paid",
        )
        .eq("id", bookingId)
        .maybeSingle();
      if (data) setBooking(data as Booking);
    }, 5000);
    return () => clearInterval(iv);
  }, [bookingId, booking?.status]);

  // The passenger's own live position, same red dot as the driver sees for
  // waiting passengers and as the generic track page shows.
  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => setSelfLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => console.warn("[ride.track.$bookingId] geolocation unavailable:", err.message),
      { enableHighAccuracy: true, maximumAge: 10_000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Before boarding: track toward the pickup stage. Once boarded: switch to
  // the dropoff stage. After alighting/cancelling: nothing left to track.
  const targetStage = useMemo(() => {
    if (!booking) return null;
    const targetId =
      booking.status === "boarded" ? booking.dropoff_stage_id : booking.pickup_stage_id;
    return stages.find((s) => s.id === targetId) ?? null;
  }, [booking, stages]);

  const tripActive = !!booking && booking.status !== "alighted" && booking.status !== "cancelled";

  // Same traffic-aware ETA the driver's own jam banner is built on, just
  // computed toward *this passenger's* next stop rather than the driver's
  // next stage generally — so "delayed" means "your leg specifically".
  const { minutes: etaMinutes, delayed: isJammed } = useLiveTrafficEta(
    tripActive && tripLoc ? { lat: tripLoc.lat, lng: tripLoc.lng } : null,
    tripActive && targetStage ? { lat: targetStage.lat, lng: targetStage.lng } : null,
  );

  // The actual road-snapped, congestion-colored route line — identical
  // mechanism to the driver's map, refreshed on the same cadence via
  // fetchCongestionRoute's own internal interval semantics (called here on a
  // 10s poll to match TRAFFIC_ETA_REFRESH_MS's cadence).
  useEffect(() => {
    if (!tripActive || !tripLoc || !targetStage || !showTraffic) {
      setCongestionRoute(null);
      return;
    }
    let cancelled = false;
    let consecutiveFailures = 0;
    async function refresh() {
      const segments = await fetchCongestionRoute(
        { lat: tripLoc!.lat, lng: tripLoc!.lng },
        { lat: targetStage!.lat, lng: targetStage!.lng },
      );
      if (cancelled) return;
      if (!segments) {
        // Keep the last known-good segments on a single failed refresh so the
        // map doesn't flicker between colored and plain every hiccup.
        consecutiveFailures += 1;
        return;
      }
      consecutiveFailures = 0;
      setCongestionRoute(segments);
    }
    refresh();
    const iv = setInterval(refresh, 10_000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
    // Coordinates (not object identity) are what should restart this —
    // tripLoc changes every 5s and would otherwise thrash the interval.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripActive, tripLoc?.lat, tripLoc?.lng, targetStage?.lat, targetStage?.lng, showTraffic]);

  // Surface a one-time popup the moment this booking reaches a terminal
  // state, rather than silently swapping the live map out for TripSummary.
  // sessionStorage keeps it from reopening every time the passenger
  // navigates back to this page within the same session/tab.
  useEffect(() => {
    if (!booking) return;
    if (booking.status !== "alighted" && booking.status !== "cancelled") return;
    const key = `trip-ended-popup-shown:${booking.id}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    setShowEndedPopup(true);
  }, [booking?.status, booking?.id]);

  const mapStages: MapStage[] = stages.map((s) => ({
    id: s.id,
    name: s.name,
    lat: s.lat,
    lng: s.lng,
  }));
  const mapVehicles: MapVehicle[] = tripLoc
    ? [
        {
          id: trip?.id ?? "trip",
          lat: tripLoc.lat,
          lng: tripLoc.lng,
          heading: tripLoc.heading,
          label: vehicle
            ? `${vehicle.plate_number}${vehicle.nickname ? ` · ${vehicle.nickname}` : ""}`
            : "Matatu",
          kind: vehicleKindFromType(vehicle?.vehicle_type),
        },
      ]
    : [];

  // Straight-line fallback (what liveRoute draws) is still useful the moment
  // congestionRoute hasn't loaded yet, or if Mapbox has no reading, so the
  // map never looks "empty" while the real, road-snapped line catches up.
  const liveRoute =
    tripLoc && targetStage && tripActive
      ? {
          origin: { lat: tripLoc.lat, lng: tripLoc.lng },
          destination: { lat: targetStage.lat, lng: targetStage.lng },
        }
      : null;

  const tabs = [
    { to: "/ride", label: "Find a ride" },
    { to: "/ride/track", label: "Track" },
    { to: "/ride/history", label: "My bookings" },
  ];

  if (loading) {
    return (
      <AppShell
        title="Track"
        subtitle="Loading your trip…"
        tabs={tabs}
        assistantContext={{ page: "passenger_tracking" }}
      >
        <p className="text-sm text-muted-foreground">Loading your trip…</p>
      </AppShell>
    );
  }

  if (notFound || !booking || !trip) {
    return (
      <AppShell
        title="Track"
        subtitle="We couldn't find that booking."
        tabs={tabs}
        assistantContext={{ page: "passenger_tracking" }}
      >
        <p className="text-sm text-muted-foreground">
          We couldn't find that booking, or it's no longer yours to view.
        </p>
        <Link
          to="/ride/track"
          search={{ skip: true }}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary underline"
        >
          <ArrowLeft className="size-3" /> Back to Track
        </Link>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={routeInfo ? routeInfo.name : "Track"}
      subtitle={routeInfo ? `${routeInfo.origin} → ${routeInfo.destination}` : "Your trip"}
      tabs={tabs}
      assistantContext={{ page: "passenger_tracking", details: `Tracking booking ${bookingId}` }}
    >
      <div className="grid gap-4">
        <div className="rounded-xl border border-border bg-surface p-3">
          <p className="text-sm font-medium">{STATUS_LABEL[booking.status] ?? booking.status}</p>
          {booking.status === "cancelled" && booking.cancellation_reason && (
            <p className="mt-1 text-xs text-muted-foreground">
              Reason: {booking.cancellation_reason}
            </p>
          )}
          {targetStage && tripActive && (
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="size-3" />
              {booking.status === "boarded" ? "Heading to" : "Picking you up at"} {targetStage.name}
              {etaMinutes != null && ` · ~${etaMinutes} min away`}
            </p>
          )}
        </div>

        {booking.status === "alighted" || booking.status === "cancelled" ? (
          <TripSummary
            booking={booking}
            trip={trip}
            route={routeInfo}
            stages={stages}
            vehicle={vehicle}
          />
        ) : (
          <>
            {tripActive && (
              <div className="flex items-center justify-between gap-2">
                {isJammed ? (
                  <div className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-xs font-medium text-destructive">
                    <span className="size-2 rounded-full bg-destructive" />
                    Heavy traffic ahead{targetStage ? ` near ${targetStage.name}` : ""} — route
                    shown in red
                  </div>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  onClick={() => setShowTraffic((v) => !v)}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium ${
                    showTraffic
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  Traffic {showTraffic ? "on" : "off"}
                </button>
              </div>
            )}

            <RouteMap
              stages={mapStages}
              vehicles={mapVehicles}
              selfPosition={selfLoc}
              liveRoute={liveRoute}
              showTraffic={showTraffic}
              jammed={isJammed}
              congestionRoute={congestionRoute}
              className="h-[420px] w-full rounded-2xl border border-border"
            />

            {mapVehicles.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Waiting for the matatu's live location to come through.
              </p>
            )}
          </>
        )}

        <Link
          to="/ride/track"
          search={{ skip: true }}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary underline"
        >
          <ArrowLeft className="size-3" /> Not your trip? See all routes
        </Link>
      </div>

      <Dialog open={showEndedPopup} onOpenChange={setShowEndedPopup}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {booking.status === "cancelled"
                ? "Your booking was cancelled"
                : "Your driver has ended the trip"}
            </DialogTitle>
            <DialogDescription>
              {booking.status === "cancelled"
                ? "Here's what happened with this booking."
                : "Rate your driver if you'd like — it's optional, and other passengers can see it."}
            </DialogDescription>
          </DialogHeader>
          {trip && (
            <TripSummary
              booking={booking}
              trip={trip}
              route={routeInfo}
              stages={stages}
              vehicle={vehicle}
            />
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
