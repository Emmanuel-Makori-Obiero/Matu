import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";

import { toast } from "sonner";
import { ArrowLeft, MapPin, Users, Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/matu/AppShell";
import { RouteMap, type MapStage, type MapVehicle } from "@/components/matu/RouteMap";
import { LeaveNowBanner } from "@/components/matu/LeaveNowBanner";

type Stage = { id: string; name: string; lat: number; lng: number; order_index: number };
type Trip = {
  id: string;
  fare: number;
  status: string;
  vehicle_id: string;
};
type TripLoc = { lat: number; lng: number; heading: number | null };

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
  const [bookedCounts, setBookedCounts] = useState<Record<string, number>>({});
  const [bookingTripId, setBookingTripId] = useState<string | null>(null);
  const [bookedBookingId, setBookedBookingId] = useState<string | null>(null);
  const [bookedTripId, setBookedTripId] = useState<string | null>(null);
  const [payPhone, setPayPhone] = useState("");
  const [payingBookingId, setPayingBookingId] = useState<string | null>(null);
  const [payChoice, setPayChoice] = useState<"mpesa" | "cash">("mpesa");
  const [paymentStatus, setPaymentStatus] = useState<
    Record<string, "pending" | "held" | "failed" | "cash">
  >({});
  const [myBookings, setMyBookings] = useState<
    { trip_id: string; pickup_stage_id: string | null; dropoff_stage_id: string | null }[]
  >([]);
  const notifiedRef = useRef<Set<string>>(new Set());

  const [pickup, setPickup] = useState<string>("");
  const [dropoff, setDropoff] = useState<string>("");
  const [pingCounts, setPingCounts] = useState<Record<string, number>>({});
  const [myPingStageId, setMyPingStageId] = useState<string | null>(null);
  const [pinging, setPinging] = useState(false);

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

  // Lightweight demand signal: poll (and subscribe to) how many people are currently
  // waiting at each stage on this route. No booking required — this is deliberately
  // separate from the seat-booking flow above, for routes where matatus fill up
  // organically rather than against a timetable.
  async function loadPingCounts() {
    const { data } = await supabase.rpc("get_stage_ping_counts", { _route_id: routeId });
    const counts: Record<string, number> = {};
    (data ?? []).forEach((r: { stage_id: string; waiting_count: number }) => {
      counts[r.stage_id] = Number(r.waiting_count);
    });
    setPingCounts(counts);
  }

  useEffect(() => {
    loadPingCounts();
    const ch = supabase
      .channel(`stage-pings-${routeId}`)
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

  async function pingStage(stageId: string) {
    setPinging(true);
    const { error } = await supabase.rpc("ping_stage", { _stage_id: stageId });
    setPinging(false);
    if (error) return toast.error(error.message);
    setMyPingStageId(stageId);
    toast.success("Marked you as waiting here — drivers can see demand building.");
    loadPingCounts();
  }

  // Load booked-seat counts for every visible trip so "seats left" shows on
  // the collapsed card without needing to open the booking panel first.
  useEffect(() => {
    if (trips.length === 0) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        trips.map(async (t) => {
          const { data } = await supabase.rpc("get_trip_booked_count", { _trip_id: t.id });
          return [t.id, data ?? 0] as const;
        }),
      );
      if (cancelled) return;
      setBookedCounts((prev) => {
        const next = { ...prev };
        entries.forEach(([id, count]) => (next[id] = count));
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
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
          heading: tripLocs[t.id].heading,
          label: vehicles[t.vehicle_id]?.plate_number ?? "Matatu",
        })),
    [trips, vehicles, tripLocs],
  );

  function openBookingPanel(tripId: string) {
    setSelectedTrip(tripId);
  }

  async function bookSeat(tripId: string) {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const trip = trips.find((t) => t.id === tripId);
    if (!trip) return;
    if (!pickup || !dropoff) return toast.error("Pick your pickup and drop-off stages");

    setBookingTripId(tripId);
    // Re-check capacity right before booking rather than trusting the last-loaded
    // count — someone else may have booked the last spot in the meantime.
    const { data: currentCount } = await supabase.rpc("get_trip_booked_count", {
      _trip_id: tripId,
    });
    const takenCount = currentCount ?? 0;
    const capacity = vehicles[trip.vehicle_id]?.capacity ?? 14;
    if (takenCount >= capacity) {
      setBookingTripId(null);
      setBookedCounts((prev) => ({ ...prev, [tripId]: takenCount }));
      return toast.error("This trip just filled up — try another matatu.");
    }

    // No seat_number: passengers sit wherever's free on board, so booking just
    // reserves a spot rather than a specific seat. Capacity is enforced above
    // (best-effort check) and again by the driver seeing seatsBooked vs capacity.
    const { data: newBooking, error } = await supabase
      .from("bookings")
      .insert({
        trip_id: tripId,
        passenger_id: u.user.id,
        pickup_stage_id: pickup,
        dropoff_stage_id: dropoff,
        fare_paid: trip.fare,
        status: "reserved",
      })
      .select("id")
      .single();
    setBookingTripId(null);
    if (error || !newBooking) return toast.error(error?.message ?? "Could not reserve your spot");
    toast.success("Spot reserved — pay to confirm it.");
    setBookedBookingId(newBooking.id);
    setBookedTripId(tripId);
    setPayChoice("mpesa");
    setBookedCounts((prev) => ({ ...prev, [tripId]: (prev[tripId] ?? takenCount) + 1 }));
  }

  // Cash coexists with M-Pesa instead of forcing cashless — matatus run on cash today,
  // and past cashless mandates in Kenya stalled when they cut crews out of daily cash
  // flow. This just confirms the seat and tells the passenger to pay the conductor.
  async function payWithCash(bookingId: string) {
    const { error } = await supabase
      .from("bookings")
      .update({ status: "confirmed", payment_method: "cash" })
      .eq("id", bookingId);
    if (error) return toast.error(error.message);
    setPaymentStatus((prev) => ({ ...prev, [bookingId]: "cash" }));
    toast.success("Seat confirmed — pay the conductor in cash when you board.");
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

    // Safety net: if M-Pesa/the callback never responds at all (e.g. the passenger
    // cancels the STK prompt, which the sandbox doesn't always report back as a
    // callback), stop waiting after 15s instead of leaving the button stuck on
    // "Check your phone..." forever. The realtime subscription above already handles
    // the normal case where the callback does arrive — this only fires if nothing
    // ever comes back at all.
    setTimeout(() => {
      setPaymentStatus((prev) => {
        if (prev[bookedBookingId] !== "pending") return prev; // already resolved by the callback
        return { ...prev, [bookedBookingId]: "failed" };
      });
      setPayingBookingId((prev) => (prev === bookedBookingId ? null : prev));
      toast.error("Payment not received. If you cancelled or weren't prompted, try again.");
    }, 15_000);
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
      tabs={[
        { to: "/ride", label: "Find a ride" },
        { to: "/ride/history", label: "My bookings" },
      ]}
      assistantContext={{ page: "passenger_route_details", details: routeId }}
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
                        <div className="flex flex-col items-end gap-1">
                          <div className="rounded-md bg-accent/40 px-2 py-1 text-xs font-semibold">
                            KSh {t.fare}
                          </div>
                          {(() => {
                            const capacity = v?.capacity ?? 14;
                            const takenCount = bookedCounts[t.id] ?? 0;
                            const left = Math.max(capacity - takenCount, 0);
                            const isLow = left <= 3 && left > 0;
                            const isFull = left === 0;
                            return (
                              <span
                                className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                                  isFull
                                    ? "bg-destructive/15 text-destructive"
                                    : isLow
                                      ? "bg-amber-500/15 text-amber-600"
                                      : "bg-muted text-muted-foreground"
                                }`}
                              >
                                {isFull ? "Full" : `${left} seat${left === 1 ? "" : "s"} left`}
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          onClick={() => openBookingPanel(t.id)}
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
                          <div className="flex gap-2">
                            <button
                              onClick={() => bookSeat(t.id)}
                              className="flex-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-60"
                              disabled={!pickup || !dropoff || bookingTripId === t.id}
                            >
                              {bookingTripId === t.id ? "Booking…" : "Confirm booking"}
                            </button>
                            <button
                              onClick={() => {
                                setSelectedTrip(null);
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
                        paymentStatus[bookedBookingId] !== "held" &&
                        paymentStatus[bookedBookingId] !== "cash" && (
                          <div className="mt-3 grid gap-2 border-t border-border pt-3">
                            <p className="text-xs font-medium">
                              Pay KSh {t.fare} to confirm your spot
                            </p>

                            <div className="flex gap-1 rounded-md border border-border p-1">
                              <button
                                type="button"
                                onClick={() => setPayChoice("mpesa")}
                                className={`flex-1 rounded px-2 py-1 text-xs font-medium transition ${
                                  payChoice === "mpesa"
                                    ? "bg-primary text-primary-foreground"
                                    : "text-muted-foreground"
                                }`}
                              >
                                M-Pesa
                              </button>
                              <button
                                type="button"
                                onClick={() => setPayChoice("cash")}
                                className={`flex-1 rounded px-2 py-1 text-xs font-medium transition ${
                                  payChoice === "cash"
                                    ? "bg-primary text-primary-foreground"
                                    : "text-muted-foreground"
                                }`}
                              >
                                Cash to conductor
                              </button>
                            </div>

                            {payChoice === "mpesa" ? (
                              <>
                                {paymentStatus[bookedBookingId] === "failed" &&
                                  payingBookingId !== bookedBookingId && (
                                    <p className="text-xs font-medium text-destructive">
                                      Payment failed — you weren't charged. Try again below.
                                    </p>
                                  )}
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
                              </>
                            ) : (
                              <button
                                onClick={() => payWithCash(bookedBookingId)}
                                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                              >
                                Confirm — I'll pay cash on board
                              </button>
                            )}
                          </div>
                        )}

                      {bookedTripId === t.id &&
                        bookedBookingId &&
                        (paymentStatus[bookedBookingId] === "held" ||
                          paymentStatus[bookedBookingId] === "cash") && (
                          <div className="mt-3 grid gap-2 border-t border-border pt-3">
                            {paymentStatus[bookedBookingId] === "cash" && (
                              <p className="rounded-md bg-accent/30 px-3 py-2 text-xs font-medium">
                                Booking confirmed. Pay KSh {t.fare} cash to the conductor when you
                                board.
                              </p>
                            )}
                            <LeaveNowBanner
                              busPos={
                                tripLocs[t.id]
                                  ? { lat: tripLocs[t.id].lat, lng: tripLocs[t.id].lng }
                                  : null
                              }
                              stage={(() => {
                                const s = stages.find((st) => st.id === pickup);
                                return s ? { lat: s.lat, lng: s.lng, name: s.name } : null;
                              })()}
                            />
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
            <p className="mt-1 text-xs text-muted-foreground">
              Waiting at a stage right now? Ping it so nearby drivers know demand is building — no
              booking needed.
            </p>
            <ol className="mt-3 grid gap-1.5 text-sm">
              {stages.map((s) => {
                const count = pingCounts[s.id] ?? 0;
                const isMine = myPingStageId === s.id;
                return (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-2 rounded-md px-1 py-0.5"
                  >
                    <span className="flex items-center gap-2">
                      <MapPin className="size-3 text-primary" /> {s.name}
                      {count > 0 && (
                        <span className="rounded-full bg-accent/40 px-1.5 py-0.5 text-[10px] font-semibold">
                          {count} waiting
                        </span>
                      )}
                    </span>
                    <button
                      onClick={() => pingStage(s.id)}
                      disabled={pinging || isMine}
                      className={`rounded-md border px-2 py-1 text-[11px] font-medium transition disabled:opacity-60 ${
                        isMine
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:bg-secondary"
                      }`}
                    >
                      {isMine ? "You're here" : "I'm waiting here"}
                    </button>
                  </li>
                );
              })}
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
