import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";

import { toast } from "sonner";
import { ArrowLeft, MapPin, Users, Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/matu/AppShell";
import { RouteMap, type MapStage, type MapVehicle } from "@/components/matu/RouteMap";
import { LeaveNowBanner } from "@/components/matu/LeaveNowBanner";
import { useLiveTrafficEta } from "@/lib/traffic-eta";
import { testSound, primeAudioOnFirstInteraction } from "@/lib/noisy-alert";

type Stage = { id: string; name: string; lat: number; lng: number; order_index: number };
type Trip = {
  id: string;
  fare: number;
  status: string;
  vehicle_id: string;
  driver_id: string;
};
type DriverPayment = {
  driver_payment_method: "pochi" | "send_money" | "buy_goods" | null;
  driver_payment_target: string | null;
  driver_payment_name: string | null;
};
type TripLoc = { lat: number; lng: number; heading: number | null };

type Vehicle = { id: string; plate_number: string; capacity: number; nickname: string | null };

export const Route = createFileRoute("/_authenticated/ride/$routeId")({
  validateSearch: (search: Record<string, unknown>) => ({
    from: typeof search.from === "string" ? search.from : undefined,
    to: typeof search.to === "string" ? search.to : undefined,
    trip: typeof search.trip === "string" ? search.trip : undefined,
  }),
  component: RouteDetail,
});

function RouteDetail() {
  const navigate = useNavigate();
  const { routeId } = Route.useParams();
  const { from: fromParam, to: toParam, trip: tripParam } = Route.useSearch();
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
  // When booking more than one seat, bookSeat() inserts one row per seat.
  // bookedBookingId stays the "primary" one that the existing pay/track flow
  // already keys off of; the rest of the party's booking ids live here so
  // payment confirmation can be applied to all of them together.
  const [siblingBookingIds, setSiblingBookingIds] = useState<string[]>([]);
  const [seatCount, setSeatCount] = useState(1);
  const [bookedTripId, setBookedTripId] = useState<string | null>(null);
  const [driverPayments, setDriverPayments] = useState<Record<string, DriverPayment>>({});
  const [payingBookingId, setPayingBookingId] = useState<string | null>(null);
  const [payChoice, setPayChoice] = useState<"manual" | "cash">("manual");
  const [paymentStatus, setPaymentStatus] = useState<Record<string, "held" | "cash" | "manual">>(
    {},
  );
  // Tracks whether the driver has actually confirmed a manual (M-Pesa direct)
  // payment server-side. Starts false the moment the passenger taps "I've
  // sent the payment" — that tap only self-declares it was sent, it's not
  // confirmation. This flips true only via the driver's own RPC call.
  const [manualPaymentConfirmed, setManualPaymentConfirmed] = useState<Record<string, boolean>>({});
  const [myBookings, setMyBookings] = useState<
    { trip_id: string; pickup_stage_id: string | null; dropoff_stage_id: string | null }[]
  >([]);
  // A passenger with an active booking ANYWHERE (any route/trip) is blocked from
  // starting a second one — one active reservation at a time. Holds just enough
  // to show a "you already have a booking" message with a link to it.
  const [blockingBooking, setBlockingBooking] = useState<{ id: string; sameTrip: boolean } | null>(
    null,
  );
  const notifiedRef = useRef<Set<string>>(new Set());

  const [pickup, setPickup] = useState<string>("");
  const [dropoff, setDropoff] = useState<string>("");
  const [pingCounts, setPingCounts] = useState<Record<string, number>>({});
  const [myPingStageId, setMyPingStageId] = useState<string | null>(null);
  const [pinging, setPinging] = useState(false);

  // Passenger proximity pings below need real audio playback, which browsers only
  // allow after a genuine user gesture — this listens for the passenger's first tap
  // anywhere on this page and uses it to silently unlock audio, so that by the time
  // the "matatu is near" ping actually needs to fire, it's already able to play.
  useEffect(() => {
    primeAudioOnFirstInteraction();
  }, []);

  // Passenger already picked pickup/drop-off by name on the "Find a ride" page —
  // once this route's own stages have loaded, match those names to this route's
  // actual stage ids so the per-trip booking panel opens pre-filled instead of
  // asking the passenger to pick pickup/drop-off a second time.
  useEffect(() => {
    if (stages.length === 0) return;
    if (fromParam && !pickup) {
      const match = stages.find((s) => s.name.toLowerCase() === fromParam.trim().toLowerCase());
      if (match) setPickup(match.id);
    }
    if (toParam && !dropoff) {
      const match = stages.find((s) => s.name.toLowerCase() === toParam.trim().toLowerCase());
      if (match) setDropoff(match.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stages, fromParam, toParam]);

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
      .select("id,fare,status,vehicle_id,driver_id")
      .eq("route_id", routeId)
      .in("status", ["boarding", "in_transit"]);
    const t = (data ?? []) as Trip[];
    setTrips(t);
    const vehicleIds = [...new Set(t.map((x) => x.vehicle_id))];
    if (vehicleIds.length) {
      const { data: v } = await supabase
        .from("vehicles")
        .select("id,plate_number,capacity,nickname")
        .in("id", vehicleIds);
      const map: Record<string, Vehicle> = {};
      (v ?? []).forEach((x: Vehicle) => (map[x.id] = x));
      setVehicles(map);
    }
    const driverIds = [...new Set(t.map((x) => x.driver_id))];
    if (driverIds.length) {
      const { data: dp } = await supabase
        .from("profiles")
        .select("id,driver_payment_method,driver_payment_target,driver_payment_name")
        .in("id", driverIds);
      const map: Record<string, DriverPayment> = {};
      (dp ?? []).forEach((x) => {
        map[x.id as string] = x as unknown as DriverPayment;
      });
      setDriverPayments(map);
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

  // One active booking at a time, full stop — checked independently of which
  // route/trip is on screen (the check above only covers trips on *this*
  // route). If the passenger already has a reserved/confirmed/boarded booking
  // on ANY trip, block starting a new one here and point them at the existing
  // one instead of letting two reservations exist at once.
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase
        .from("bookings")
        .select("id,trip_id")
        .eq("passenger_id", u.user.id)
        .in("status", ["reserved", "confirmed", "boarded"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        setBlockingBooking({ id: data.id, sameTrip: data.trip_id === bookedTripId });
      } else {
        setBlockingBooking(null);
      }
    })();
  }, [routeId, bookedBookingId, bookedTripId]);

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
        .select("id,trip_id,pickup_stage_id,dropoff_stage_id,status")
        .eq("passenger_id", u.user.id)
        .in(
          "trip_id",
          trips.map((t) => t.id),
        )
        .in("status", ["reserved", "confirmed", "boarded"]);
      const rows = (data ?? []) as {
        id: string;
        trip_id: string;
        pickup_stage_id: string | null;
        dropoff_stage_id: string | null;
        status: string;
      }[];
      // Restore state that only ever lived in memory (bookedBookingId etc.), so
      // leaving the app mid-payment (or just reloading this page) doesn't strand the
      // passenger back at "pick a trip" with no way to get to their pending payment.
      // A confirmed booking goes straight to the dedicated tracking page; a reserved
      // one re-opens this same pay panel exactly where they left off.
      const mine = rows.find((b) => b.status === "reserved" || b.status === "confirmed");
      if (mine && !bookedBookingId) {
        if (mine.status === "confirmed") {
          navigate({ to: "/ride/track/$bookingId", params: { bookingId: mine.id } });
        } else {
          setBookedBookingId(mine.id);
          setBookedTripId(mine.trip_id);
          setPayChoice("manual");
        }
      }
      setMyBookings(
        rows as {
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
    toast.success("Marked you as waiting here. Drivers can see demand building.");
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
          // A silent toast is easy to miss if the passenger isn't looking at their
          // phone — play their chosen alert sound once, same sound library the
          // driver side uses, so this is audible even if the screen is in a pocket.
          testSound();
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

  // A specific vehicle picked on the "Find a ride" page arrives here via
  // ?trip=<id> — open its booking panel directly instead of making the
  // passenger find and tap it again from this route's own trip list.
  useEffect(() => {
    if (tripParam && trips.some((t) => t.id === tripParam)) {
      setSelectedTrip(tripParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripParam, trips]);

  // Watches the passenger's own booking row for manual_payment_confirmed
  // flipping true (set only by the driver's confirm_manual_payment RPC), so
  // "waiting for conductor" updates to "confirmed" live without a refresh.
  useEffect(() => {
    if (!bookedBookingId) return;
    const ch = supabase
      .channel(`booking-${bookedBookingId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "bookings",
          filter: `id=eq.${bookedBookingId}`,
        },
        (payload) => {
          const row = payload.new as { manual_payment_confirmed?: boolean };
          if (row.manual_payment_confirmed) {
            setManualPaymentConfirmed((prev) => ({ ...prev, [bookedBookingId]: true }));
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [bookedBookingId]);

  async function bookSeat(tripId: string) {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const trip = trips.find((t) => t.id === tripId);
    if (!trip) return;
    if (!pickup || !dropoff) return toast.error("Pick your pickup and drop-off stages");
    if (blockingBooking && blockingBooking.id !== bookedBookingId) {
      return toast.error("You already have an active booking. Finish or cancel it first.");
    }

    setBookingTripId(tripId);
    // Re-check capacity right before booking rather than trusting the last-loaded
    // count — someone else may have booked the last spot in the meantime.
    const { data: currentCount } = await supabase.rpc("get_trip_booked_count", {
      _trip_id: tripId,
    });
    const takenCount = currentCount ?? 0;
    const capacity = vehicles[trip.vehicle_id]?.capacity ?? 14;
    if (takenCount + seatCount > capacity) {
      setBookingTripId(null);
      setBookedCounts((prev) => ({ ...prev, [tripId]: takenCount }));
      const left = Math.max(0, capacity - takenCount);
      return toast.error(
        left === 0
          ? "This trip just filled up. Try another matatu."
          : `Only ${left} seat${left === 1 ? "" : "s"} left on this trip.`,
      );
    }

    // No seat_number: passengers sit wherever's free on board, so booking just
    // reserves a spot rather than a specific seat. Capacity is enforced above
    // (best-effort check) and again by the driver seeing seatsBooked vs capacity.
    // One row per seat — there's no "party size" column on bookings, so a
    // multi-seat booking is just N identical rows sharing the same trip,
    // passenger, pickup, and drop-off, inserted together in one call.
    const { data: newBookings, error } = await supabase
      .from("bookings")
      .insert(
        Array.from({ length: seatCount }, () => ({
          trip_id: tripId,
          passenger_id: u.user.id,
          pickup_stage_id: pickup,
          dropoff_stage_id: dropoff,
          fare_paid: trip.fare,
          status: "reserved",
        })),
      )
      .select("id");
    setBookingTripId(null);
    if (error || !newBookings || newBookings.length === 0) {
      return toast.error(error?.message ?? "Could not reserve your spot");
    }
    const [primary, ...rest] = newBookings.map((b) => b.id as string);
    toast.success(
      seatCount > 1
        ? `${seatCount} spots reserved. Pay to confirm them.`
        : "Spot reserved. Pay to confirm it.",
    );
    setBookedBookingId(primary);
    setSiblingBookingIds(rest);
    setBookedTripId(tripId);
    setPayChoice("manual");
    setBookedCounts((prev) => ({ ...prev, [tripId]: (prev[tripId] ?? takenCount) + seatCount }));
  }

  // Cash coexists with M-Pesa instead of forcing cashless — matatus run on cash today,
  // and past cashless mandates in Kenya stalled when they cut crews out of daily cash
  // flow. This just confirms the seat and tells the passenger to pay the conductor.
  async function payWithCash(bookingId: string) {
    const ids = [bookingId, ...siblingBookingIds];
    const { error } = await supabase
      .from("bookings")
      .update({ status: "confirmed", payment_method: "cash" })
      .in("id", ids);
    if (error) return toast.error(error.message);
    setPaymentStatus((prev) => ({ ...prev, [bookingId]: "cash" }));
    toast.success(
      ids.length > 1
        ? `${ids.length} seats confirmed. Pay the conductor in cash when you board.`
        : "Seat confirmed. Pay the conductor in cash when you board.",
    );
  }

  // Passenger pays the driver directly, outside the app, using the driver's own
  // Pochi la Biashara / Send Money / Buy Goods details shown below — Matu never
  // touches this money and never initiates an STK prompt. This just self-declares
  // the payment was sent, the same trust level "cash to conductor" already had; the
  // conductor is the one who actually verifies it, by checking the M-Pesa SMS on
  // their own phone before letting the passenger board.
  async function payWithManualMethod(bookingId: string, method: string) {
    setPayingBookingId(bookingId);
    // `method` here is the driver's channel (pochi/send_money/buy_goods) — useful for
    // the UI copy above, but bookings.payment_method has a DB check constraint that
    // only allows 'mpesa' | 'cash' (it records how the passenger paid, not which
    // specific M-Pesa channel the driver uses). All three manual channels are M-Pesa,
    // so always store 'mpesa' here — passing `method` straight through violates
    // bookings_payment_method_check and silently fails the whole confirmation.
    void method;
    const ids = [bookingId, ...siblingBookingIds];
    const { error } = await supabase
      .from("bookings")
      .update({ status: "confirmed", payment_method: "mpesa" })
      .in("id", ids);
    setPayingBookingId(null);
    if (error) return toast.error(error.message);
    setPaymentStatus((prev) => ({ ...prev, [bookingId]: "manual" }));
    toast.success(
      ids.length > 1
        ? `${ids.length} seats marked as sent. Show your M-Pesa message to the conductor when you board.`
        : "Marked as sent. Show your M-Pesa message to the conductor when you board.",
    );
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

  // Once a booking is confirmed, this is the vehicle + stage the passenger cares
  // about. Computed once here (not inline in JSX) since it feeds a hook, and reused
  // for both the map's live route line and its "Arriving in X min" label — same
  // numbers everywhere, no risk of the line and the label disagreeing.
  const trackedConfirmed =
    !!bookedTripId &&
    !!bookedBookingId &&
    (paymentStatus[bookedBookingId] === "held" || paymentStatus[bookedBookingId] === "cash");
  const trackedVehiclePos =
    trackedConfirmed && bookedTripId && tripLocs[bookedTripId]
      ? { lat: tripLocs[bookedTripId].lat, lng: tripLocs[bookedTripId].lng }
      : null;
  // Once the booking is actually confirmed (cash accepted, conductor confirmed
  // manual payment, or M-Pesa held), send the passenger to the dedicated
  // per-booking tracking page. That page reads the booking by its URL param
  // and reloads it from Supabase on mount, so — unlike the in-memory state on
  // this booking-flow page — it survives a refresh. Without this redirect, a
  // refresh here always re-renders this page from scratch (route picker +
  // live vehicles, i.e. "the booking process again") because bookedBookingId
  // was never persisted anywhere but React state.
  const bookingIsConfirmed =
    !!bookedBookingId &&
    (paymentStatus[bookedBookingId] === "cash" ||
      paymentStatus[bookedBookingId] === "held" ||
      (paymentStatus[bookedBookingId] === "manual" && manualPaymentConfirmed[bookedBookingId]));
  useEffect(() => {
    if (bookingIsConfirmed && bookedBookingId) {
      navigate({ to: "/ride/track/$bookingId", params: { bookingId: bookedBookingId } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingIsConfirmed, bookedBookingId]);

  const trackedStage = trackedConfirmed ? stages.find((st) => st.id === pickup) : undefined;
  const trackedDestination = trackedStage ? { lat: trackedStage.lat, lng: trackedStage.lng } : null;
  const { minutes: trackedEtaMinutes } = useLiveTrafficEta(trackedVehiclePos, trackedDestination);
  const etaLabelByVehicleId =
    bookedTripId && trackedEtaMinutes != null
      ? {
          [bookedTripId]:
            trackedEtaMinutes <= 0 ? "Arriving now" : `Arriving in ${trackedEtaMinutes} min`,
        }
      : undefined;

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
        <RouteMap
          stages={mapStages}
          vehicles={mapVehicles}
          liveRoute={
            trackedVehiclePos && trackedDestination
              ? { origin: trackedVehiclePos, destination: trackedDestination }
              : null
          }
          onLiveRouteStaleChange={(stale) => {
            if (stale)
              toast.error("Live route couldn't refresh — the line on the map may be outdated.");
          }}
          etaLabelByVehicleId={etaLabelByVehicleId}
        />

        <div className="grid gap-4">
          <section className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="font-display text-lg font-semibold">Live matatus ({trips.length})</h2>
            {blockingBooking && blockingBooking.id !== bookedBookingId && (
              <p className="mt-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
                You already have an active booking. Finish or cancel it before booking another seat
                —{" "}
                <Link to="/ride/history" className="font-medium underline">
                  view it in My bookings
                </Link>
                .
              </p>
            )}
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
                          disabled={!!blockingBooking && blockingBooking.id !== bookedBookingId}
                          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
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
                          <StageAutocomplete
                            stages={stages}
                            value={pickup}
                            onChange={setPickup}
                            label="Pickup"
                          />
                          <StageAutocomplete
                            stages={stages}
                            value={dropoff}
                            onChange={setDropoff}
                            label="Drop-off"
                          />
                          <label className="text-xs">
                            <span className="mb-1 block font-medium">Number of seats</span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setSeatCount((n) => Math.max(1, n - 1))}
                                className="size-7 rounded-md border border-input text-sm font-medium"
                              >
                                −
                              </button>
                              <span className="w-6 text-center text-sm font-semibold">
                                {seatCount}
                              </span>
                              <button
                                type="button"
                                onClick={() => setSeatCount((n) => Math.min(4, n + 1))}
                                className="size-7 rounded-md border border-input text-sm font-medium"
                              >
                                +
                              </button>
                              <span className="text-[11px] text-muted-foreground">
                                Booking for more than one person? Up to 4 seats at once.
                              </span>
                            </div>
                          </label>
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
                        paymentStatus[bookedBookingId] !== "cash" &&
                        paymentStatus[bookedBookingId] !== "manual" && (
                          <div className="mt-3 grid gap-2 border-t border-border pt-3">
                            <p className="text-xs font-medium">
                              Pay KSh {t.fare} to confirm your spot
                            </p>

                            <div className="flex gap-1 rounded-md border border-border p-1">
                              <button
                                type="button"
                                onClick={() => setPayChoice("manual")}
                                className={`flex-1 rounded px-2 py-1 text-xs font-medium transition ${
                                  payChoice === "manual"
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

                            {payChoice === "manual" ? (
                              (() => {
                                const dp = driverPayments[t.driver_id];
                                if (!dp?.driver_payment_method || !dp.driver_payment_target) {
                                  return (
                                    <p className="rounded-md bg-secondary px-3 py-2 text-xs text-muted-foreground">
                                      This driver hasn't set up M-Pesa details yet. Choose cash
                                      instead, or ask the conductor.
                                    </p>
                                  );
                                }
                                const methodLabel =
                                  dp.driver_payment_method === "buy_goods"
                                    ? "Buy Goods (Till)"
                                    : dp.driver_payment_method === "pochi"
                                      ? "Pochi la Biashara"
                                      : "Send Money";
                                return (
                                  <>
                                    <div className="rounded-md bg-secondary px-3 py-2 text-xs">
                                      <p className="font-semibold">{methodLabel}</p>
                                      <p className="mt-0.5">
                                        {dp.driver_payment_method === "buy_goods"
                                          ? "Till number: "
                                          : "Phone: "}
                                        <span className="font-semibold">
                                          {dp.driver_payment_target}
                                        </span>
                                      </p>
                                      <p className="mt-0.5">
                                        Name:{" "}
                                        <span className="font-semibold">
                                          {dp.driver_payment_name}
                                        </span>
                                      </p>
                                      <p className="mt-1.5 text-muted-foreground">
                                        Open M-Pesa on your phone and pay KSh {t.fare} using these
                                        details. Then tap below.
                                      </p>
                                    </div>
                                    <button
                                      onClick={() =>
                                        payWithManualMethod(
                                          bookedBookingId,
                                          dp.driver_payment_method as string,
                                        )
                                      }
                                      disabled={payingBookingId === bookedBookingId}
                                      className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-60"
                                    >
                                      {payingBookingId === bookedBookingId
                                        ? "Saving…"
                                        : "I've sent the payment"}
                                    </button>
                                  </>
                                );
                              })()
                            ) : (
                              <button
                                onClick={() => payWithCash(bookedBookingId)}
                                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                              >
                                Confirm: I'll pay cash on board
                              </button>
                            )}
                          </div>
                        )}

                      {bookedTripId === t.id &&
                        bookedBookingId &&
                        (paymentStatus[bookedBookingId] === "held" ||
                          paymentStatus[bookedBookingId] === "manual" ||
                          paymentStatus[bookedBookingId] === "cash") && (
                          <div className="mt-3 grid gap-2 border-t border-border pt-3">
                            {paymentStatus[bookedBookingId] === "cash" && (
                              <p className="rounded-md bg-accent/30 px-3 py-2 text-xs font-medium">
                                Booking confirmed. Pay KSh {t.fare} cash to the conductor when you
                                board.
                              </p>
                            )}
                            {paymentStatus[bookedBookingId] === "manual" &&
                              (manualPaymentConfirmed[bookedBookingId] ? (
                                <p className="rounded-md bg-accent/30 px-3 py-2 text-xs font-medium">
                                  Payment confirmed by the conductor. You're good to board.
                                </p>
                              ) : (
                                <p className="rounded-md bg-secondary px-3 py-2 text-xs font-medium text-muted-foreground">
                                  Payment sent — waiting for the conductor to confirm. Keep your
                                  M-Pesa message ready to show them when you board.
                                </p>
                              ))}
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
              Waiting at a stage right now? Ping it so nearby drivers know demand is building. No
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

function StageAutocomplete({
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
  const selected = stages.find((s) => s.id === value);
  const [query, setQuery] = useState(selected?.name ?? "");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Stay in sync if `value` changes from outside (e.g. auto-matched from the
  // "from"/"to" params passed in from the Find a ride page).
  useEffect(() => {
    const s = stages.find((st) => st.id === value);
    setQuery(s?.name ?? "");
  }, [value, stages]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const matches =
    query.trim().length === 0
      ? stages
      : stages.filter((s) => s.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div ref={containerRef} className="relative text-xs">
      <label className="text-xs">
        <span className="mb-1 block font-medium">{label}</span>
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            if (value) onChange(""); // typing again means the old selection no longer applies
          }}
          onFocus={() => setOpen(true)}
          placeholder="Type a stage name…"
          className="w-full rounded-md border border-input bg-background px-2 py-1.5"
        />
      </label>
      {open && (
        <ul className="absolute z-[1000] mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-surface shadow-lg">
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-muted-foreground">No stages match "{query}"</li>
          ) : (
            matches.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(s.id);
                    setQuery(s.name);
                    setOpen(false);
                  }}
                  className="block w-full px-3 py-2 text-left hover:bg-secondary"
                >
                  {s.name}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
