// FILE: src/routes/_authenticated/ride.track.$bookingId.tsx
// Per-booking tracking screen — shown after ride.track.tsx finds an active
// booking and redirects here. Unlike the generic ride/track picker, this page
// is about ONE specific trip: it shows only that vehicle on the map, the
// live "remaining route" line from the vehicle to the passenger's pickup or
// dropoff stage (whichever hasn't happened yet), and the booking's own status.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/matu/AppShell";
import { RouteMap, type MapStage, type MapVehicle } from "@/components/matu/RouteMap";

type Booking = {
  id: string;
  trip_id: string;
  status: string;
  pickup_stage_id: string | null;
  dropoff_stage_id: string | null;
};
type Trip = { id: string; route_id: string; vehicle_id: string; status: string };
type RouteRow = { id: string; name: string; origin: string; destination: string };
type Stage = { id: string; name: string; lat: number; lng: number; order_index: number };
type Vehicle = { id: string; plate_number: string; nickname: string | null };
type TripLoc = { lat: number; lng: number; heading: number | null };

const STATUS_LABEL: Record<string, string> = {
  reserved: "Reserved — pay to confirm your seat",
  confirmed: "Confirmed — matatu is on the way",
  boarded: "You're on board",
  alighted: "Trip complete",
  cancelled: "Booking cancelled",
};

export const Route = createFileRoute("/_authenticated/ride/track/$bookingId")({
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
        .select("id,trip_id,status,pickup_stage_id,dropoff_stage_id")
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
        .select("id,route_id,vehicle_id,status")
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
          .select("id,plate_number,nickname")
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
  // generic track page and the booking flow's live map.
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

  // The passenger's own live position, same red dot as the generic track page.
  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => setSelfLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => console.warn("[ride.track.$bookingId] geolocation unavailable:", err.message),
      { enableHighAccuracy: true, maximumAge: 10_000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

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
        },
      ]
    : [];

  // Before boarding: show the remaining route to the pickup stage. Once
  // boarded: switch it to the dropoff stage instead. After that, no more
  // live route line — the trip's over.
  const targetStageId =
    booking?.status === "boarded" ? booking.dropoff_stage_id : booking?.pickup_stage_id;
  const targetStage = stages.find((s) => s.id === targetStageId) ?? null;
  const liveRoute =
    tripLoc && targetStage && booking?.status !== "alighted" && booking?.status !== "cancelled"
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
          {targetStage && booking.status !== "alighted" && booking.status !== "cancelled" && (
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="size-3" />
              {booking.status === "boarded" ? "Heading to" : "Picking you up at"} {targetStage.name}
            </p>
          )}
        </div>

        <RouteMap
          stages={mapStages}
          vehicles={mapVehicles}
          selfPosition={selfLoc}
          liveRoute={liveRoute}
          className="h-[420px] w-full rounded-2xl border border-border"
        />

        {mapVehicles.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Waiting for the matatu's live location to come through.
          </p>
        )}

        <Link
          to="/ride/track"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary underline"
        >
          <ArrowLeft className="size-3" /> Not your trip? See all routes
        </Link>
      </div>
    </AppShell>
  );
}
