import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Ban, CheckCircle2, Clock, MapPin, Navigation2, QrCode, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/matu/AppShell";
import { LeaveNowBanner } from "@/components/matu/LeaveNowBanner";
import type { LatLng } from "@/lib/traffic-eta";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { TripSummary } from "@/components/matu/TripSummary";

type BookingRow = {
  id: string;
  trip_id: string;
  seat_number: number | null;
  pickup_stage_id: string | null;
  dropoff_stage_id: string | null;
  status: "reserved" | "confirmed" | "boarded" | "alighted" | "cancelled";
  fare_paid: number | null;
  created_at: string;
  cancellation_reason: string | null;
  boarded_at: string | null;
  alighted_at: string | null;
};
type TripRow = {
  id: string;
  fare: number;
  status: string;
  route_id: string;
  vehicle_id: string;
  driver_id: string;
  started_at: string | null;
  ended_at: string | null;
};
type RouteRow = { id: string; name: string; origin: string; destination: string };
type VehicleRow = { id: string; plate_number: string; nickname: string | null };
type StageRow = { id: string; name: string; lat: number; lng: number };
type PaymentRow = {
  id: string;
  booking_id: string | null;
  status: "pending" | "held" | "released" | "refunded" | "failed";
};

export const Route = createFileRoute("/_authenticated/ride/history")({
  component: BookingHistory,
});

const STATUS_LABEL: Record<BookingRow["status"], string> = {
  reserved: "Reserved, pending payment",
  confirmed: "Confirmed",
  boarded: "Boarded",
  alighted: "Completed",
  cancelled: "Cancelled",
};

const UPCOMING_STATUSES = new Set(["reserved", "confirmed", "boarded"]);
// A booking is considered paid once its payment has been captured into escrow or released.
const PAID_PAYMENT_STATUSES = new Set(["held", "released"]);

function BookingHistory() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [trips, setTrips] = useState<Record<string, TripRow>>({});
  const [routes, setRoutes] = useState<Record<string, RouteRow>>({});
  const [vehicles, setVehicles] = useState<Record<string, VehicleRow>>({});
  const [stages, setStages] = useState<Record<string, StageRow>>({});
  const [paymentByBooking, setPaymentByBooking] = useState<Record<string, PaymentRow>>({});
  const [tripLocs, setTripLocs] = useState<Record<string, LatLng>>({});
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [ticketBooking, setTicketBooking] = useState<BookingRow | null>(null);
  const [summaryBooking, setSummaryBooking] = useState<BookingRow | null>(null);

  async function load() {
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      setLoading(false);
      return;
    }
    const { data: b } = await supabase
      .from("bookings")
      .select(
        "id,trip_id,seat_number,pickup_stage_id,dropoff_stage_id,status,fare_paid,created_at,cancellation_reason,boarded_at,alighted_at",
      )
      .eq("passenger_id", u.user.id)
      .order("created_at", { ascending: false });
    const bookingRows = (b ?? []) as BookingRow[];
    setBookings(bookingRows);

    const bookingIds = bookingRows.map((r) => r.id);
    if (bookingIds.length) {
      const { data: p } = await supabase
        .from("payments")
        .select("id,booking_id,status")
        .in("booking_id", bookingIds)
        .eq("payer_id", u.user.id);
      const paymentMap: Record<string, PaymentRow> = {};
      (p ?? []).forEach((x: PaymentRow) => {
        if (x.booking_id) paymentMap[x.booking_id] = x;
      });
      setPaymentByBooking(paymentMap);
    }

    const tripIds = [...new Set(bookingRows.map((r) => r.trip_id))];
    if (tripIds.length) {
      const { data: t } = await supabase
        .from("trips")
        .select("id,fare,status,route_id,vehicle_id,driver_id,started_at,ended_at")
        .in("id", tripIds);
      const tripMap: Record<string, TripRow> = {};
      (t ?? []).forEach((x: TripRow) => (tripMap[x.id] = x));
      setTrips(tripMap);

      const routeIds = [...new Set((t ?? []).map((x: TripRow) => x.route_id))];
      const vehicleIds = [...new Set((t ?? []).map((x: TripRow) => x.vehicle_id))];
      const [{ data: r }, { data: v }] = await Promise.all([
        routeIds.length
          ? supabase.from("routes").select("id,name,origin,destination").in("id", routeIds)
          : Promise.resolve({ data: [] as RouteRow[] }),
        vehicleIds.length
          ? supabase.from("vehicles").select("id,plate_number,nickname").in("id", vehicleIds)
          : Promise.resolve({ data: [] as VehicleRow[] }),
      ]);
      const routeMap: Record<string, RouteRow> = {};
      (r ?? []).forEach((x: RouteRow) => (routeMap[x.id] = x));
      setRoutes(routeMap);
      const vehicleMap: Record<string, VehicleRow> = {};
      (v ?? []).forEach((x: VehicleRow) => (vehicleMap[x.id] = x));
      setVehicles(vehicleMap);
    }

    const stageIds = [
      ...new Set(
        bookingRows
          .flatMap((r) => [r.pickup_stage_id, r.dropoff_stage_id])
          .filter((x): x is string => !!x),
      ),
    ];
    if (stageIds.length) {
      const { data: s } = await supabase
        .from("stages")
        .select("id,name,lat,lng")
        .in("id", stageIds);
      const stageMap: Record<string, StageRow> = {};
      (s ?? []).forEach((x: StageRow) => (stageMap[x.id] = x));
      setStages(stageMap);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll live vehicle positions for any upcoming booking whose trip is actually
  // moving — this powers the walk-time/bus-ETA line on each booking card. Scoped
  // to in_transit/boarding trips only so we're not polling for trips that haven't
  // left yet or have already ended.
  useEffect(() => {
    const trackableTripIds = Object.values(trips)
      .filter((t) => t.status === "in_transit" || t.status === "boarding")
      .map((t) => t.id);
    if (!trackableTripIds.length) {
      setTripLocs({});
      return;
    }

    let cancelled = false;
    const fetchLocs = async () => {
      const results = await Promise.all(
        trackableTripIds.map((id) =>
          supabase.rpc("get_trip_location", { _trip_id: id }).then(({ data }) => ({
            id,
            row: Array.isArray(data) ? data[0] : null,
          })),
        ),
      );
      if (cancelled) return;
      setTripLocs((prev) => {
        const next = { ...prev };
        results.forEach(({ id, row }) => {
          if (row?.current_lat != null && row?.current_lng != null) {
            next[id] = { lat: row.current_lat, lng: row.current_lng };
          } else {
            delete next[id];
          }
        });
        return next;
      });
    };
    fetchLocs();
    const iv = setInterval(fetchLocs, 5000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [trips]);

  async function cancelBooking(bookingId: string) {
    setCancelling(bookingId);
    const reason = cancelReason.trim() || null;
    // Goes through a SECURITY DEFINER RPC rather than a direct table write —
    // see the migration comment on cancel_booking for why a plain
    // .update() here can hit "permission denied for table bookings" as the
    // live DB's write lockdown tightens.
    const { data: ok, error } = await supabase.rpc("cancel_booking", {
      _booking_id: bookingId,
      _reason: reason,
    });
    setCancelling(null);
    setConfirmingCancel(null);
    setCancelReason("");
    if (error) return toast.error(error.message || "Could not cancel booking");
    if (!ok) return toast.error("This booking can no longer be cancelled");
    toast.success("Booking cancelled");
    setBookings((prev) =>
      prev.map((b) =>
        b.id === bookingId
          ? { ...b, status: "cancelled" as const, cancellation_reason: reason }
          : b,
      ),
    );
  }

  const upcoming = bookings.filter((b) => UPCOMING_STATUSES.has(b.status));
  const past = bookings.filter((b) => !UPCOMING_STATUSES.has(b.status));

  const ticketTrip = ticketBooking ? trips[ticketBooking.trip_id] : undefined;
  const ticketRoute = ticketTrip ? routes[ticketTrip.route_id] : undefined;
  const ticketVehicle = ticketTrip ? vehicles[ticketTrip.vehicle_id] : undefined;
  const ticketPickup = ticketBooking?.pickup_stage_id
    ? stages[ticketBooking.pickup_stage_id]
    : undefined;
  const ticketDropoff = ticketBooking?.dropoff_stage_id
    ? stages[ticketBooking.dropoff_stage_id]
    : undefined;
  // The QR payload is just the booking id — a conductor/driver scanning it can look the
  // booking up directly. No external QR library needed: this free image API renders a PNG
  // from the encoded text.
  const qrUrl = ticketBooking
    ? `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(
        `MATU-TICKET:${ticketBooking.id}`,
      )}`
    : "";

  return (
    <AppShell
      title="My bookings"
      subtitle="Your upcoming and past matatu bookings."
      tabs={[
        { to: "/ride", label: "Find a ride" },
        { to: "/ride/track", label: "Track" },
        { to: "/ride/history", label: "My bookings" },
      ]}
    >
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading your bookings…</p>
      ) : bookings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">You haven&rsquo;t booked a ride yet.</p>
          <Link
            to="/ride"
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Find a matatu
          </Link>
        </div>
      ) : (
        <div className="grid gap-8">
          <section>
            <h2 className="font-display text-lg font-semibold">Upcoming ({upcoming.length})</h2>
            {upcoming.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No upcoming bookings.</p>
            ) : (
              <ul className="mt-3 grid gap-3">
                {upcoming.map((b) => {
                  const trip = trips[b.trip_id];
                  const route = trip ? routes[trip.route_id] : undefined;
                  const vehicle = trip ? vehicles[trip.vehicle_id] : undefined;
                  const pickup = b.pickup_stage_id ? stages[b.pickup_stage_id] : undefined;
                  const dropoff = b.dropoff_stage_id ? stages[b.dropoff_stage_id] : undefined;
                  const canCancel = b.status === "reserved" || b.status === "confirmed";
                  const payment = paymentByBooking[b.id];
                  const isPaid = !!payment && PAID_PAYMENT_STATUSES.has(payment.status);
                  const canShowTicket =
                    isPaid && (b.status === "confirmed" || b.status === "boarded");
                  return (
                    <li key={b.id} className="rounded-2xl border border-border bg-surface p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-display text-sm font-semibold">
                            {route?.name ?? "Route"}
                          </div>
                          <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                            <MapPin className="size-3 shrink-0" />
                            <span className="truncate">
                              {pickup?.name ?? "—"} → {dropoff?.name ?? "—"}
                            </span>
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {vehicle?.plate_number ?? "—"}
                            {vehicle?.nickname ? ` · ${vehicle.nickname}` : ""}
                            {b.seat_number ? ` · Seat ${b.seat_number}` : ""}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="rounded-md bg-accent/30 px-2 py-1 text-xs font-semibold text-accent-foreground">
                            KSh {b.fare_paid ?? trip?.fare ?? "—"}
                          </div>
                          <div className="mt-1 flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
                            <Clock className="size-3" /> {STATUS_LABEL[b.status]}
                          </div>
                        </div>
                      </div>

                      {pickup &&
                        trip &&
                        (trip.status === "in_transit" || trip.status === "boarding") &&
                        b.status !== "boarded" && (
                          <div className="mt-3">
                            <LeaveNowBanner busPos={tripLocs[trip.id] ?? null} stage={pickup} />
                          </div>
                        )}

                      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                        {canShowTicket && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setTicketBooking(b);
                            }}
                            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                          >
                            <QrCode className="size-3" /> View ticket
                          </button>
                        )}
                        {trip?.status === "in_transit" || trip?.status === "boarding" ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate({
                                to: "/ride/track/$bookingId",
                                params: { bookingId: b.id },
                              });
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary"
                          >
                            <Navigation2 className="size-3" /> Track on map
                          </button>
                        ) : null}
                        {b.status === "reserved" && trip && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate({
                                to: "/ride/$routeId",
                                params: { routeId: trip.route_id },
                                search: { from: undefined, to: undefined, trip: trip.id },
                              });
                            }}
                            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                          >
                            Finish payment
                          </button>
                        )}
                        {canCancel &&
                          (confirmingCancel === b.id ? (
                            <div
                              className="flex w-full flex-col gap-2 sm:w-64"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <span className="text-xs text-muted-foreground">
                                Cancel this booking? Let us know why (optional):
                              </span>
                              <Textarea
                                value={cancelReason}
                                onChange={(e) => setCancelReason(e.target.value)}
                                placeholder="e.g. Plans changed, found another matatu…"
                                className="min-h-16 text-xs"
                                maxLength={280}
                              />
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => cancelBooking(b.id)}
                                  disabled={cancelling === b.id}
                                  className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground disabled:opacity-60"
                                >
                                  {cancelling === b.id ? "Cancelling…" : "Yes, cancel"}
                                </button>
                                <button
                                  onClick={() => {
                                    setConfirmingCancel(null);
                                    setCancelReason("");
                                  }}
                                  className="rounded-md border border-border px-3 py-1.5 text-xs"
                                >
                                  Keep booking
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmingCancel(b.id);
                                setCancelReason("");
                              }}
                              className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:border-destructive hover:text-destructive"
                            >
                              <Ban className="size-3" /> Cancel booking
                            </button>
                          ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section>
            <h2 className="font-display text-lg font-semibold">Past ({past.length})</h2>
            {past.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No past bookings yet.</p>
            ) : (
              <ul className="mt-3 grid gap-2">
                {past.map((b) => {
                  const trip = trips[b.trip_id];
                  const route = trip ? routes[trip.route_id] : undefined;
                  const pickup = b.pickup_stage_id ? stages[b.pickup_stage_id] : undefined;
                  const dropoff = b.dropoff_stage_id ? stages[b.dropoff_stage_id] : undefined;
                  return (
                    <li
                      key={b.id}
                      onClick={() => trip && setSummaryBooking(b)}
                      className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background p-3 opacity-80 ${
                        trip ? "cursor-pointer hover:opacity-100" : ""
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{route?.name ?? "Route"}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {pickup?.name ?? "—"} → {dropoff?.name ?? "—"} ·{" "}
                          {new Date(b.created_at).toLocaleDateString("en-KE", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <div className="flex flex-col items-end gap-0.5 text-xs">
                          <div className="flex items-center gap-1">
                            {b.status === "cancelled" ? (
                              <XCircle className="size-3.5 text-destructive" />
                            ) : (
                              <CheckCircle2 className="size-3.5 text-primary" />
                            )}
                            {STATUS_LABEL[b.status]}
                          </div>
                          {b.status === "cancelled" && b.cancellation_reason && (
                            <span className="max-w-[16rem] truncate text-[11px] text-muted-foreground">
                              “{b.cancellation_reason}”
                            </span>
                          )}
                        </div>
                        {trip && (
                          <span className="text-[11px] text-muted-foreground underline">
                            View trip
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}

      <Dialog open={!!ticketBooking} onOpenChange={(open) => !open && setTicketBooking(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Your ticket</DialogTitle>
            <DialogDescription>
              Show this to the conductor to board. It refreshes automatically. No need to screenshot
              it.
            </DialogDescription>
          </DialogHeader>
          {ticketBooking && (
            <div className="flex flex-col items-center gap-4 py-2">
              <img
                src={qrUrl}
                alt="Boarding QR ticket"
                width={200}
                height={200}
                className="rounded-lg border border-border"
              />
              <div className="w-full rounded-xl border border-border bg-surface p-3 text-center">
                <div className="font-display text-sm font-semibold">
                  {ticketRoute?.name ?? "Route"}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {ticketPickup?.name ?? "—"} → {ticketDropoff?.name ?? "—"}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {ticketVehicle?.plate_number ?? "—"}
                  {ticketVehicle?.nickname ? ` · ${ticketVehicle.nickname}` : ""}
                  {ticketBooking.seat_number ? ` · Seat ${ticketBooking.seat_number}` : ""}
                </div>
                <div className="mt-2 text-[11px] text-muted-foreground">
                  Ticket ID: {ticketBooking.id.slice(0, 8).toUpperCase()}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!summaryBooking} onOpenChange={(open) => !open && setSummaryBooking(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Trip summary</DialogTitle>
            <DialogDescription>The receipt for this ride.</DialogDescription>
          </DialogHeader>
          {summaryBooking &&
            (() => {
              const summaryTrip = trips[summaryBooking.trip_id];
              if (!summaryTrip) return null;
              const summaryRoute = routes[summaryTrip.route_id] ?? null;
              const summaryVehicle = vehicles[summaryTrip.vehicle_id] ?? null;
              return (
                <TripSummary
                  booking={summaryBooking}
                  trip={summaryTrip}
                  route={summaryRoute}
                  stages={Object.values(stages)}
                  vehicle={summaryVehicle}
                />
              );
            })()}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
