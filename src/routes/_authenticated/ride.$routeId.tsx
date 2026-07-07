import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";

import { toast } from "sonner";
import { ArrowLeft, MapPin, Users, Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/matu/AppShell";
import { RouteMap, type MapStage, type MapVehicle } from "@/components/matu/RouteMap";

type Stage = { id: string; name: string; lat: number; lng: number; order_index: number };
type Trip = {
  id: string;
  fare: number;
  status: string;
  vehicle_id: string;
};
type TripLoc = { lat: number; lng: number };

type Vehicle = { id: string; plate_number: string; capacity: number; nickname: string | null };

export const Route = createFileRoute("/_authenticated/ride/$routeId")({
  component: RouteDetail,
});

function RouteDetail() {
  const { routeId } = Route.useParams();
  const [routeInfo, setRouteInfo] = useState<{
    name: string;
    origin: string;
    destination: string;
  } | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [vehicles, setVehicles] = useState<Record<string, Vehicle>>({});
  const [tripLocs, setTripLocs] = useState<Record<string, TripLoc>>({});
  const [selectedTrip, setSelectedTrip] = useState<string | null>(null);
  const [takenSeats, setTakenSeats] = useState<Record<string, number[]>>({});
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);
  const [bookedBookingId, setBookedBookingId] = useState<string | null>(null);
  const [bookedTripId, setBookedTripId] = useState<string | null>(null);
  const [payPhone, setPayPhone] = useState("");
  const [payingBookingId, setPayingBookingId] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<Record<string, "pending" | "held" | "failed">>(
    {},
  );
  const [myBookings, setMyBookings] = useState<
    { trip_id: string; pickup_stage_id: string | null; dropoff_stage_id: string | null }[]
  >([]);
  const notifiedRef = useRef<Set<string>>(new Set());

  const [pickup, setPickup] = useState<string>("");
  const [dropoff, setDropoff] = useState<string>("");

  useEffect(() => {
    (async () => {
      const [{ data: r }, { data: s }] = await Promise.all([
        supabase.from("routes").select("name,origin,destination").eq("id", routeId).maybeSingle(),
        supabase
          .from("stages")
          .select("id,name,lat,lng,order_index")
          .eq("route_id", routeId)
          .order("order_index"),
      ]);
      if (r) setRouteInfo(r);
      setStages((s ?? []) as Stage[]);
    })();
  }, [routeId]);

  async function loadTrips() {
    const { data } = await supabase
      .from("trips")
      .select("id,fare,status,vehicle_id")
      .eq("route_id", routeId)
      .in("status", ["boarding", "in_transit"]);
    const t = (data ?? []) as Trip[];
    setTrips(t);
    const ids = [...new Set(t.map((x) => x.vehicle_id))];
    if (ids.length) {
      const { data: v } = await supabase
        .from("vehicles")
        .select("id,plate_number,capacity,nickname")
        .in("id", ids);
      const map: Record<string, Vehicle> = {};
      (v ?? []).forEach((x: Vehicle) => (map[x.id] = x));
      setVehicles(map);
    }
  }

  useEffect(() => {
    loadTrips();
    const ch = supabase
      .channel(`trips-route-${routeId}`)
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

  // Fetch live locations for trips the user is authorized to see (via RPC)
  useEffect(() => {
    if (trips.length === 0) return;
    let cancelled = false;
    const fetchAll = async () => {
      const entries = await Promise.all(
        trips.map(async (t) => {
          const { data } = await supabase.rpc("get_trip_location", { _trip_id: t.id });
          const row = Array.isArray(data) ? data[0] : null;
          if (row?.current_lat != null && row?.current_lng != null) {
            return [t.id, { lat: row.current_lat, lng: row.current_lng }] as const;
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

  // Load my active bookings on this route's trips
  useEffect(() => {
    if (trips.length === 0) {
      setMyBookings([]);
      return;
    }
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase
        .from("bookings")
        .select("trip_id,pickup_stage_id,dropoff_stage_id,status")
        .eq("passenger_id", u.user.id)
        .in(
          "trip_id",
          trips.map((t) => t.id),
        )
        .in("status", ["reserved", "boarded"]);
      setMyBookings(
        (data ?? []) as {
          trip_id: string;
          pickup_stage_id: string | null;
          dropoff_stage_id: string | null;
        }[],
      );
    })();
  }, [trips]);

  // Watch for M-Pesa confirming the payment (updated by the mpesa-callback edge function)
  useEffect(() => {
    if (!bookedBookingId) return;
    const ch = supabase
      .channel(`payment-${bookedBookingId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "payments",
          filter: `booking_id=eq.${bookedBookingId}`,
        },
        (payload) => {
          const status = payload.new.status as "pending" | "held" | "failed";
          setPaymentStatus((prev) => ({ ...prev, [bookedBookingId]: status }));
          setPayingBookingId(null);
          if (status === "held") toast.success("Payment confirmed! Seat secured.");
          if (status === "failed") toast.error("Payment failed. Try again.");
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [bookedBookingId]);

  // Auto proximity notifications: fire once per stage when driver GPS < 300m
  useEffect(() => {
    if (myBookings.length === 0) return;
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "default") Notification.requestPermission();
    const notified = notifiedRef.current;
    const R = 6371000;
    const dist = (a: TripLoc, b: { lat: number; lng: number }) => {
      const toRad = (x: number) => (x * Math.PI) / 180;
      const dLat = toRad(b.lat - a.lat);
      const dLng = toRad(b.lng - a.lng);
      const s =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(s));
    };
    myBookings.forEach((b) => {
      const loc = tripLocs[b.trip_id];
      if (!loc) return;
      const check = (stageId: string | null, kind: "pickup" | "dropoff") => {
        if (!stageId) return;
        const stage = stages.find((s) => s.id === stageId);
        if (!stage) return;
        const key = `${b.trip_id}:${kind}`;
        if (notified.has(key)) return;
        if (dist(loc, stage) < 300) {
          notified.add(key);
          const title = kind === "pickup" ? "Matatu near your pickup" : "Approaching your stop";
          const body =
            kind === "pickup"
              ? `Bus is <300m from ${stage.name}`
              : `Get ready to alight at ${stage.name}`;
          toast.info(title, { description: body });
          if (Notification.permission === "granted") new Notification(title, { body });
        }
      };
      check(b.pickup_stage_id, "pickup");
      check(b.dropoff_stage_id, "dropoff");
    });
  }, [tripLocs, myBookings, stages]);

  const mapStages: MapStage[] = stages;
  const mapVehicles: MapVehicle[] = useMemo(
    () =>
      trips
        .filter((t) => tripLocs[t.id])
        .map((t) => ({
          id: t.id,
          lat: tripLocs[t.id].lat,
          lng: tripLocs[t.id].lng,
          label: vehicles[t.vehicle_id]?.plate_number ?? "Matatu",
        })),
    [trips, vehicles, tripLocs],
  );

  async function openSeatPicker(tripId: string) {
    setSelectedTrip(tripId);
    setSelectedSeat(null);
    const { data } = await supabase.rpc("get_trip_taken_seats", { _trip_id: tripId });
    const seats = (data ?? [])
      .map((r: { seat_number: number | null }) => r.seat_number)
      .filter((n: number | null): n is number => n != null);
    setTakenSeats((prev) => ({ ...prev, [tripId]: seats }));
  }

  async function bookSeat(tripId: string) {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const trip = trips.find((t) => t.id === tripId);
    if (!trip) return;
    if (!selectedSeat) return toast.error("Pick a seat");
    if (!pickup || !dropoff) return toast.error("Pick your pickup and drop-off stages");
    const { data: newBooking, error } = await supabase
      .from("bookings")
      .insert({
        trip_id: tripId,
        passenger_id: u.user.id,
        seat_number: selectedSeat,
        pickup_stage_id: pickup,
        dropoff_stage_id: dropoff,
        fare_paid: trip.fare,
        status: "reserved",
      })
      .select("id")
      .single();
    if (error || !newBooking) return toast.error(error?.message ?? "Could not reserve seat");
    toast.success(`Seat ${selectedSeat} reserved — pay to confirm it.`);
    setBookedBookingId(newBooking.id);
    setBookedTripId(tripId);
    setSelectedSeat(null);
  }

  async function payForBooking(tripId: string) {
    if (!bookedBookingId) return;
    if (!payPhone.trim()) return toast.error("Enter your M-Pesa phone number");
    const trip = trips.find((t) => t.id === tripId);
    if (!trip) return;
    setPayingBookingId(bookedBookingId);
    const { error } = await supabase.functions.invoke("mpesa-stk-push", {
      body: { bookingId: bookedBookingId, phone: payPhone.trim(), amount: trip.fare },
    });
    if (error) {
      toast.error("Could not start payment. Try again.");
      setPayingBookingId(null);
      return;
    }
    toast.success("Check your phone and enter your M-Pesa PIN");
    setPaymentStatus((prev) => ({ ...prev, [bookedBookingId]: "pending" }));
  }

  async function sendAlert(tripId: string, type: "near_pickup" | "alight_request") {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase.from("alerts").insert({
      trip_id: tripId,
      passenger_id: u.user.id,
      type,
      message:
        type === "alight_request" ? "Passenger wants to alight" : "Passenger waiting at pickup",
    });
    if (error) return toast.error(error.message);
    toast.success("Driver notified");
  }

  return (
    <AppShell
      title={routeInfo?.name ?? "Route"}
      subtitle={routeInfo ? `${routeInfo.origin} → ${routeInfo.destination}` : ""}
    >
      <div className="mb-4">
        <Link
          to="/ride"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> All routes
        </Link>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <RouteMap stages={mapStages} vehicles={mapVehicles} />

        <div className="grid gap-4">
          <section className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="font-display text-lg font-semibold">Live matatus ({trips.length})</h2>
            {trips.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                No matatus on this route right now.
              </p>
            ) : (
              <ul className="mt-3 grid gap-2">
                {trips.map((t) => {
                  const v = vehicles[t.vehicle_id];
                  return (
                    <li key={t.id} className="rounded-xl border border-border bg-background p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold">{v?.plate_number ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">
                            {v?.nickname ?? ""} · {t.status}
                          </div>
                        </div>
                        <div className="rounded-md bg-accent/40 px-2 py-1 text-xs font-semibold">
                          KSh {t.fare}
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          onClick={() => openSeatPicker(t.id)}
                          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                        >
                          <Users className="mr-1 inline size-3" /> Book seat
                        </button>
                        <button
                          onClick={() => sendAlert(t.id, "near_pickup")}
                          className="rounded-md border border-border px-3 py-1.5 text-xs"
                        >
                          <Bell className="mr-1 inline size-3" /> I'm at pickup
                        </button>
                        <button
                          onClick={() => sendAlert(t.id, "alight_request")}
                          className="rounded-md border border-border px-3 py-1.5 text-xs"
                        >
                          Alight next stage
                        </button>
                      </div>

                      {selectedTrip === t.id && (
                        <div className="mt-3 grid gap-3 border-t border-border pt-3">
                          <StageSelect
                            stages={stages}
                            value={pickup}
                            onChange={setPickup}
                            label="Pickup"
                          />
                          <StageSelect
                            stages={stages}
                            value={dropoff}
                            onChange={setDropoff}
                            label="Drop-off"
                          />
                          <SeatPicker
                            capacity={v?.capacity ?? 14}
                            taken={takenSeats[t.id] ?? []}
                            selected={selectedSeat}
                            onSelect={setSelectedSeat}
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => bookSeat(t.id)}
                              className="flex-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-60"
                              disabled={!selectedSeat || !pickup || !dropoff}
                            >
                              Confirm seat {selectedSeat ?? ""}
                            </button>
                            <button
                              onClick={() => {
                                setSelectedTrip(null);
                                setSelectedSeat(null);
                              }}
                              className="rounded-md border border-border px-3 py-1.5 text-xs"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      {bookedTripId === t.id &&
                        bookedBookingId &&
                        paymentStatus[bookedBookingId] !== "held" && (
                          <div className="mt-3 grid gap-2 border-t border-border pt-3">
                            <p className="text-xs font-medium">Pay KSh {t.fare} with M-Pesa</p>
                            <input
                              type="tel"
                              placeholder="07XX XXX XXX"
                              value={payPhone}
                              onChange={(e) => setPayPhone(e.target.value)}
                              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                            />
                            <button
                              onClick={() => payForBooking(t.id)}
                              disabled={payingBookingId === bookedBookingId}
                              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-60"
                            >
                              {payingBookingId === bookedBookingId
                                ? "Check your phone…"
                                : paymentStatus[bookedBookingId] === "failed"
                                  ? "Try payment again"
                                  : "Pay Now"}
                            </button>
                          </div>
                        )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="font-display text-lg font-semibold">Stages ({stages.length})</h2>
            <ol className="mt-3 grid gap-1 text-sm">
              {stages.map((s) => (
                <li key={s.id} className="flex items-center gap-2">
                  <MapPin className="size-3 text-primary" /> {s.name}
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </AppShell>
  );
}

function StageSelect({
  stages,
  value,
  onChange,
  label,
}: {
  stages: Stage[];
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <label className="text-xs">
      <span className="mb-1 block font-medium">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-input bg-background px-2 py-1.5"
      >
        <option value="">— select stage —</option>
        {stages.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function SeatPicker({
  capacity,
  taken,
  selected,
  onSelect,
}: {
  capacity: number;
  taken: number[];
  selected: number | null;
  onSelect: (n: number) => void;
}) {
  const seats = Array.from({ length: capacity }, (_, i) => i + 1);
  const takenSet = new Set(taken);
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">Pick a seat</span>
        <span className="text-muted-foreground">
          {capacity - taken.length} of {capacity} free
        </span>
      </div>
      <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
        {seats.map((n) => {
          const isTaken = takenSet.has(n);
          const isSel = selected === n;
          return (
            <button
              key={n}
              type="button"
              disabled={isTaken}
              onClick={() => onSelect(n)}
              className={`aspect-square rounded-md border text-xs font-medium transition ${
                isTaken
                  ? "cursor-not-allowed border-border bg-muted text-muted-foreground line-through"
                  : isSel
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background hover:border-primary"
              }`}
              aria-label={`Seat ${n}${isTaken ? " (taken)" : ""}`}
            >
              {n}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="size-2 rounded-sm border border-border bg-background" /> Free
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-2 rounded-sm bg-primary" /> You
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-2 rounded-sm bg-muted" /> Taken
        </span>
      </div>
    </div>
  );
}
