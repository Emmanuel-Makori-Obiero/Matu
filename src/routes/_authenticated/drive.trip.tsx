import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, MapPin, Bell, Play, Square, DollarSign, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/matu/AppShell";
import { RouteMap, type MapStage } from "@/components/matu/RouteMap";
import { startNoisyAlert, stopNoisyAlert, primeAudioOnFirstInteraction } from "@/lib/noisy-alert";
import { TicketScanner } from "@/components/matu/TicketScanner";
import { ParcelPanel } from "@/components/matu/ParcelPanel";

type Vehicle = { id: string; plate_number: string; capacity: number };
type RouteRow = { id: string; name: string; base_fare: number | null };
type Stage = { id: string; name: string; lat: number; lng: number; order_index: number };
type ActiveTrip = {
  id: string;
  fare: number;
  status: string;
  route_id: string;
  vehicle_id: string;
};
type BookingWithProfile = {
  id: string;
  seat_number: number | null;
  status: string;
  passenger_id: string;
  payment_method: string | null;
  cash_collected: boolean | null;
};
type AlertRow = {
  id: string;
  type: string;
  message: string | null;
  created_at: string;
  passenger_id: string;
};

export const Route = createFileRoute("/_authenticated/drive/trip")({
  component: DriverTrip,
});

function DriverTrip() {
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [vehicleId, setVehicleId] = useState("");
  const [routeId, setRouteId] = useState("");
  const [fare, setFare] = useState<string>("");
  const [trip, setTrip] = useState<ActiveTrip | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [bookings, setBookings] = useState<BookingWithProfile[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [newStageName, setNewStageName] = useState("");
  const [addStageMode, setAddStageMode] = useState(false);
  const [currentStageId, setCurrentStageId] = useState<string | null>(null);
  const [pingCounts, setPingCounts] = useState<Record<string, number>>({});

  // Load driver's vehicles + routes on mount
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const [{ data: v }, { data: r }, { data: t }] = await Promise.all([
        supabase.from("vehicles").select("id,plate_number,capacity").eq("driver_id", u.user.id),
        supabase.from("routes").select("id,name,base_fare").order("name"),
        supabase
          .from("trips")
          .select("id,fare,status,route_id,vehicle_id")
          .eq("driver_id", u.user.id)
          .in("status", ["boarding", "in_transit"])
          .maybeSingle(),
      ]);
      setVehicles((v ?? []) as Vehicle[]);
      setRoutes((r ?? []) as RouteRow[]);
      if (t) setTrip(t as ActiveTrip);
    })();
  }, []);

  // When we have a trip, load stages + bookings + alerts + subscribe
  useEffect(() => {
    if (!trip) return;
    (async () => {
      const [{ data: s }, { data: b }, { data: a }] = await Promise.all([
        supabase
          .from("stages")
          .select("id,name,lat,lng,order_index")
          .eq("route_id", trip.route_id)
          .order("order_index"),
        supabase
          .from("bookings")
          .select("id,seat_number,status,passenger_id,payment_method,cash_collected")
          .eq("trip_id", trip.id),
        supabase
          .from("alerts")
          .select("id,type,message,created_at,passenger_id")
          .eq("trip_id", trip.id)
          .order("created_at", { ascending: false }),
      ]);
      setStages((s ?? []) as Stage[]);
      setBookings((b ?? []) as BookingWithProfile[]);
      setAlerts((a ?? []) as AlertRow[]);
    })();

    primeAudioOnFirstInteraction();

    const ch = supabase
      .channel(`trip-${trip.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings", filter: `trip_id=eq.${trip.id}` },
        async () => {
          const { data } = await supabase
            .from("bookings")
            .select("id,seat_number,status,passenger_id,payment_method,cash_collected")
            .eq("trip_id", trip.id);
          setBookings((data ?? []) as BookingWithProfile[]);
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "alerts", filter: `trip_id=eq.${trip.id}` },
        (payload) => {
          const alert = payload.new as AlertRow;
          setAlerts((prev) => [alert, ...prev]);
          // Loud repeating beep so this isn't missed as a silent toast while driving —
          // stops when the driver taps "Acknowledge".
          startNoisyAlert();
          toast.info(`Passenger alert: ${alert.type.replace("_", " ")}`, {
            duration: 15000,
            action: { label: "Acknowledge", onClick: stopNoisyAlert },
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
      stopNoisyAlert(); // make sure it never keeps beeping after leaving this screen
    };
  }, [trip]);

  // GPS broadcasting while trip is active — also sends the driver's manually-picked
  // current stage, so passengers can see "at Junction" rather than just a raw dot.
  useEffect(() => {
    if (!trip) return;
    if (!("geolocation" in navigator)) return;
    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        await supabase
          .from("trips")
          .update({
            current_lat: pos.coords.latitude,
            current_lng: pos.coords.longitude,
            current_heading: pos.coords.heading,
            current_stage_id: currentStageId,
          })
          .eq("id", trip.id);
        // Also stamp the vehicle's last-known location so it still shows up on the
        // SACCO's fleet map after this trip ends (not just while actively boarding).
        await supabase
          .from("vehicles")
          .update({
            last_lat: pos.coords.latitude,
            last_lng: pos.coords.longitude,
            last_seen_at: new Date().toISOString(),
          })
          .eq("id", trip.vehicle_id);
      },
      (err) => console.warn("geo error", err),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [trip, currentStageId]);

  async function startTrip() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    if (!vehicleId || !routeId || !fare) return toast.error("Pick vehicle, route, and fare");
    const { data, error } = await supabase
      .from("trips")
      .insert({
        driver_id: u.user.id,
        vehicle_id: vehicleId,
        route_id: routeId,
        fare: Number(fare),
        status: "boarding",
        started_at: new Date().toISOString(),
      })
      .select("id,fare,status,route_id,vehicle_id")
      .single();
    if (error) return toast.error(error.message);
    setTrip(data as ActiveTrip);
    toast.success("Trip started — passengers can now book");
  }

  async function endTrip() {
    if (!trip) return;
    await supabase
      .from("trips")
      .update({ status: "completed", ended_at: new Date().toISOString() })
      .eq("id", trip.id);
    toast.success("Trip ended");
    setTrip(null);
    navigate({ to: "/drive" });
  }

  async function updateFare(next: number) {
    if (!trip) return;
    await supabase.from("trips").update({ fare: next }).eq("id", trip.id);
    setTrip({ ...trip, fare: next });
    toast.success(`Fare updated to KSh ${next}`);
  }

  async function toggleTransit() {
    if (!trip) return;
    const next = trip.status === "boarding" ? "in_transit" : "boarding";
    await supabase.from("trips").update({ status: next }).eq("id", trip.id);
    setTrip({ ...trip, status: next });
  }

  // Realtime subscription will also catch this, but we refresh immediately so the
  // driver sees the boarded status update right after closing the scanner.
  // Demand signal: show where passengers are pinging "waiting here" along this route,
  // so the driver can see build-up ahead without anyone having booked a seat.
  useEffect(() => {
    if (!trip) return;
    async function loadPingCounts() {
      if (!trip) return;
      const { data } = await supabase.rpc("get_stage_ping_counts", { _route_id: trip.route_id });
      const counts: Record<string, number> = {};
      (data ?? []).forEach((r: { stage_id: string; waiting_count: number }) => {
        counts[r.stage_id] = Number(r.waiting_count);
      });
      setPingCounts(counts);
    }
    loadPingCounts();
    const ch = supabase
      .channel(`driver-stage-pings-${trip.route_id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "stage_pings",
          filter: `route_id=eq.${trip.route_id}`,
        },
        () => loadPingCounts(),
      )
      .subscribe();
    const iv = setInterval(loadPingCounts, 20_000);
    return () => {
      supabase.removeChannel(ch);
      clearInterval(iv);
    };
  }, [trip]);

  async function refreshBookings() {
    if (!trip) return;
    const { data } = await supabase
      .from("bookings")
      .select("id,seat_number,status,passenger_id,payment_method,cash_collected")
      .eq("trip_id", trip.id);
    setBookings((data ?? []) as BookingWithProfile[]);
  }

  // Cash bookings aren't run through M-Pesa, so there's nothing for the backend to
  // confirm automatically — the conductor marks it collected themselves. This is
  // informational only: it never blocks boarding or the seat being counted as taken.
  async function markCashCollected(bookingId: string) {
    const { error } = await supabase
      .from("bookings")
      .update({ cash_collected: true })
      .eq("id", bookingId);
    if (error) return toast.error(error.message);
    setBookings((prev) =>
      prev.map((b) => (b.id === bookingId ? { ...b, cash_collected: true } : b)),
    );
    toast.success("Marked as collected");
  }

  async function addStage(lat: number, lng: number) {
    if (!trip || !addStageMode || !newStageName.trim()) {
      if (addStageMode && !newStageName.trim()) toast.error("Type a stage name first");
      return;
    }
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const nextOrder = stages.length ? Math.max(...stages.map((s) => s.order_index)) + 1 : 0;
    const { data, error } = await supabase
      .from("stages")
      .insert({
        route_id: trip.route_id,
        name: newStageName.trim(),
        lat,
        lng,
        order_index: nextOrder,
        added_by: u.user.id,
      })
      .select("id,name,lat,lng,order_index")
      .single();
    if (error) return toast.error(error.message);
    setStages((prev) => [...prev, data as Stage]);
    setNewStageName("");
    setAddStageMode(false);
    toast.success(`Stage “${data!.name}” added`);
  }

  if (!trip) {
    return (
      <AppShell
        title="Start a trip"
        subtitle="Pick your vehicle and route to begin broadcasting to passengers."
      >
        <div className="mb-4">
          <Link
            to="/drive"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"
          >
            <ArrowLeft className="size-4" /> Back
          </Link>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            startTrip();
          }}
          className="grid max-w-lg gap-3 rounded-2xl border border-border bg-surface p-6"
        >
          <label className="text-sm">
            <span className="mb-1 block font-medium">Vehicle</span>
            <select
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
              required
              className="w-full rounded-md border border-input bg-background px-3 py-2"
            >
              <option value="">— select —</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plate_number} ({v.capacity} seats)
                </option>
              ))}
            </select>
            {vehicles.length === 0 && (
              <div className="mt-3 grid gap-3">
                <RegisterOwnVehicle
                  onCreated={(v) => {
                    setVehicles((prev) => [...prev, v]);
                    setVehicleId(v.id);
                  }}
                />
                <JoinSaccoPanel />
              </div>
            )}
          </label>
          <label className="text-sm">
            <span className="mb-1 flex items-center justify-between font-medium">
              <span>Route</span>
              <NewRouteButton
                onCreated={(r) => {
                  setRoutes((prev) => [...prev, r].sort((a, b) => a.name.localeCompare(b.name)));
                  setRouteId(r.id);
                  if (r.base_fare) setFare(String(r.base_fare));
                }}
              />
            </span>
            <select
              value={routeId}
              onChange={(e) => setRouteId(e.target.value)}
              required
              className="w-full rounded-md border border-input bg-background px-3 py-2"
            >
              <option value="">— select —</option>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Today's fare (KSh)</span>
            <input
              value={fare}
              onChange={(e) => setFare(e.target.value)}
              type="number"
              min={10}
              required
              className="w-full rounded-md border border-input bg-background px-3 py-2"
            />
            <span className="mt-1 block text-xs text-muted-foreground">
              Agree with the conductor, then set it here.
            </span>
          </label>
          <button className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground">
            <Play className="size-4" /> Start trip
          </button>
        </form>
      </AppShell>
    );
  }

  const seatsBooked = bookings.filter((b) => b.status !== "cancelled").length;

  return (
    <AppShell title="Trip in progress" subtitle="Your live location is broadcasting to passengers.">
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="grid gap-3">
          <RouteMap stages={stages} onMapClick={addStage} />
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-3 text-sm">
            <button
              onClick={() => setAddStageMode((v) => !v)}
              className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium ${addStageMode ? "bg-accent text-accent-foreground" : "border border-border"}`}
            >
              <Plus className="size-3" /> {addStageMode ? "Tap map to add" : "Add stage"}
            </button>
            {addStageMode && (
              <input
                autoFocus
                placeholder="Stage name (e.g. Junction)"
                value={newStageName}
                onChange={(e) => setNewStageName(e.target.value)}
                className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-xs"
              />
            )}
          </div>
        </div>

        <div className="grid gap-4">
          <section className="rounded-2xl border border-border bg-surface p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Fare</div>
                <div className="font-display text-3xl font-bold">KSh {trip.fare}</div>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => updateFare(Math.max(10, trip.fare - 10))}
                  className="rounded-md border border-border px-2 py-1 text-sm"
                >
                  −10
                </button>
                <button
                  onClick={() => updateFare(trip.fare + 10)}
                  className="rounded-md border border-border px-2 py-1 text-sm"
                >
                  +10
                </button>
              </div>
            </div>
            {(() => {
              const capacity = vehicles.find((v) => v.id === trip.vehicle_id)?.capacity ?? 14;
              const left = Math.max(capacity - seatsBooked, 0);
              const isLow = left <= 3 && left > 0;
              const isFull = left === 0;
              return (
                <div
                  className={`mt-3 flex items-center justify-between rounded-md px-3 py-2 text-xs font-semibold ${
                    isFull
                      ? "bg-destructive/15 text-destructive"
                      : isLow
                        ? "bg-amber-500/15 text-amber-600"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  <span>
                    {seatsBooked} of {capacity} seats booked
                  </span>
                  <span>{isFull ? "Full" : `${left} left`}</span>
                </div>
              );
            })()}
            <button
              onClick={toggleTransit}
              className="mt-3 w-full rounded-md border border-border px-3 py-2 text-sm font-medium"
            >
              <DollarSign className="mr-1 inline size-4" />
              {trip.status === "boarding"
                ? "Boarding → mark in transit"
                : "In transit → back to boarding"}
            </button>
            <button
              onClick={endTrip}
              className="mt-2 w-full rounded-md bg-destructive px-3 py-2 text-sm font-medium text-destructive-foreground"
            >
              <Square className="mr-1 inline size-4" /> End trip
            </button>
          </section>

          <section className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="font-display text-lg font-semibold">Bookings ({seatsBooked})</h2>
            <div className="mt-3">
              <TicketScanner tripId={trip.id} onBoarded={refreshBookings} />
            </div>
            {bookings.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No bookings yet.</p>
            ) : (
              <ul className="mt-3 grid gap-1 text-sm">
                {bookings.map((b) => (
                  <li
                    key={b.id}
                    className="flex items-center justify-between rounded-md bg-background px-3 py-1.5"
                  >
                    <span>Passenger · seat {b.seat_number ?? "—"}</span>
                    {b.payment_method === "cash" ? (
                      b.cash_collected ? (
                        <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          Cash collected
                        </span>
                      ) : (
                        <button
                          onClick={() => markCashCollected(b.id)}
                          className="rounded-md border border-border px-2 py-0.5 text-xs font-medium hover:bg-secondary"
                        >
                          Mark cash received
                        </button>
                      )
                    ) : (
                      <span className="text-xs text-muted-foreground">{b.status}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <ParcelPanel tripId={trip.id} />

          <section className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="font-display text-lg font-semibold">Alerts</h2>
            {alerts.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No alerts.</p>
            ) : (
              <ul className="mt-3 grid gap-2 text-sm">
                {alerts.slice(0, 5).map((a) => (
                  <li
                    key={a.id}
                    className="flex items-start gap-2 rounded-md bg-background px-3 py-2"
                  >
                    <Bell className="mt-0.5 size-4 text-accent" />
                    <div>
                      <div className="font-medium">{a.type.replace("_", " ")}</div>
                      {a.message && (
                        <div className="text-xs text-muted-foreground">{a.message}</div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="font-display text-lg font-semibold">Stages ({stages.length})</h2>
            <label className="mt-2 block text-xs font-medium text-muted-foreground">
              Current stage (shown to passengers along with your GPS dot)
            </label>
            <select
              value={currentStageId ?? ""}
              onChange={(e) => setCurrentStageId(e.target.value || null)}
              className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            >
              <option value="">— none selected —</option>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <ol className="mt-3 grid gap-1 text-sm">
              {[...stages]
                .sort((a, b) => (pingCounts[b.id] ?? 0) - (pingCounts[a.id] ?? 0))
                .map((s) => {
                  const count = pingCounts[s.id] ?? 0;
                  return (
                    <li key={s.id} className="flex items-center gap-2">
                      <MapPin className="size-3 text-primary" /> {s.name}
                      {count > 0 && (
                        <span className="rounded-full bg-accent/40 px-1.5 py-0.5 text-[10px] font-semibold">
                          {count} waiting
                        </span>
                      )}
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

function NewRouteButton({ onCreated }: { onCreated: (r: RouteRow) => void }) {
  const [open, setOpen] = useState(false);
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [baseFare, setBaseFare] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!origin.trim() || !destination.trim()) return toast.error("Enter origin and destination");
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      setBusy(false);
      return;
    }
    await supabase.rpc("claim_role", { _role: "driver" });
    const name = `${origin.trim()} → ${destination.trim()}`;
    const { data, error } = await supabase
      .from("routes")
      .insert({
        name,
        origin: origin.trim(),
        destination: destination.trim(),
        base_fare: baseFare ? Number(baseFare) : null,
        created_by: u.user.id,
      })
      .select("id,name,base_fare")
      .single();
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Route created");
    onCreated(data as RouteRow);
    setOrigin("");
    setDestination("");
    setBaseFare("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs font-normal"
      >
        <Plus className="size-3" /> New route
      </button>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-1">
      <input
        value={origin}
        onChange={(e) => setOrigin(e.target.value)}
        placeholder="From (e.g. Utawala)"
        className="w-32 rounded-md border border-input bg-background px-2 py-1 text-xs"
      />
      <input
        value={destination}
        onChange={(e) => setDestination(e.target.value)}
        placeholder="To (e.g. CBD)"
        className="w-32 rounded-md border border-input bg-background px-2 py-1 text-xs"
      />
      <input
        value={baseFare}
        onChange={(e) => setBaseFare(e.target.value)}
        placeholder="Fare"
        type="number"
        className="w-14 rounded-md border border-input bg-background px-2 py-1 text-xs"
      />
      <button
        type="button"
        disabled={busy}
        onClick={create}
        className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground disabled:opacity-60"
      >
        Save
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-xs text-muted-foreground"
      >
        ✕
      </button>
    </span>
  );
}

function JoinSaccoPanel() {
  const [saccos, setSaccos] = useState<{ id: string; name: string }[]>([]);
  const [saccoId, setSaccoId] = useState("");
  const [note, setNote] = useState("");
  const [phone, setPhone] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [license, setLicense] = useState("");
  const [bringsOwnVehicle, setBringsOwnVehicle] = useState(true);
  const [plate, setPlate] = useState("");
  const [myReqs, setMyReqs] = useState<{ sacco_id: string; status: string }[]>([]);
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const [{ data: s }, { data: r }, { data: p }] = await Promise.all([
      supabase.rpc("list_public_saccos"),
      supabase.from("driver_join_requests").select("sacco_id,status").eq("driver_id", u.user.id),
      supabase
        .from("profiles")
        .select("phone,id_number,license_number")
        .eq("id", u.user.id)
        .maybeSingle(),
    ]);
    setSaccos((s ?? []) as { id: string; name: string }[]);
    setMyReqs((r ?? []) as { sacco_id: string; status: string }[]);
    if (p?.phone && !phone) setPhone(p.phone);
    if (p?.id_number && !idNumber) setIdNumber(p.id_number);
    if (p?.license_number && !license) setLicense(p.license_number);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit() {
    if (!saccoId) return toast.error("Pick a SACCO first");
    if (!phone.trim()) return toast.error("Enter your phone number so the SACCO can reach you");
    if (!idNumber.trim() || !license.trim()) return toast.error("Enter your ID and license number");
    if (bringsOwnVehicle && !plate.trim()) return toast.error("Enter your vehicle's plate number");
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      setBusy(false);
      return;
    }

    // Create (or reuse, thanks to the driver_id+sacco_id unique constraint) the join
    // request row FIRST — mpesa-stk-push needs a real reference_id to attach the Ksh
    // 1,000 fee to, the same way sacco_subscriptions payments work. Trying to pay before
    // this row exists is exactly why this fee never worked before: there was nothing for
    // the STK push to reference.
    const { data: requestRow, error: requestError } = await supabase
      .from("driver_join_requests")
      .upsert(
        {
          driver_id: u.user.id,
          sacco_id: saccoId,
          phone: phone.trim(),
          id_number: idNumber.trim(),
          license_number: license.trim(),
          brings_own_vehicle: bringsOwnVehicle,
          vehicle_plate: bringsOwnVehicle ? plate.trim().toUpperCase() : null,
          note: note.trim() || null,
          status: "pending",
        },
        { onConflict: "driver_id,sacco_id" },
      )
      .select("id")
      .single();

    if (requestError || !requestRow) {
      setBusy(false);
      return toast.error(requestError?.message ?? "Could not create the join request.");
    }

    // Ksh 1,000 joining fee — charged now that we have a real request row to attach it
    // to. mpesa-stk-push recognizes purpose: "sacco_join_fee" + reference_id (added
    // alongside its existing sacco_subscription handling) and stamps the checkout id
    // onto this row; mpesa-callback then marks join_fee_status paid/failed on it.
    const { error: payError } = await supabase.functions.invoke("mpesa-stk-push", {
      body: {
        purpose: "sacco_join_fee",
        reference_id: requestRow.id,
        phone: phone.trim(),
        amount: 1000,
      },
    });
    if (payError) {
      setBusy(false);
      return toast.error("Could not start the Ksh 1,000 payment. Try again.");
    }
    toast("Check your phone and enter your M-Pesa PIN to complete the Ksh 1,000 fee.");

    await supabase.rpc("claim_role", { _role: "driver" });

    await supabase
      .from("profiles")
      .update({ phone: phone.trim(), id_number: idNumber.trim(), license_number: license.trim() })
      .eq("id", u.user.id);

    if (bringsOwnVehicle && plate.trim()) {
      // Register the vehicle now (unattached); approve_driver_request() attaches it to
      // the SACCO once the owner approves the request.
      await supabase.from("vehicles").upsert(
        {
          plate_number: plate.trim().toUpperCase(),
          driver_id: u.user.id,
          capacity: 14,
          sacco_id: null,
        },
        { onConflict: "plate_number" },
      );
    }

    setBusy(false);
    toast.success("Request sent — the SACCO owner will see your details and approve it");
    setNote("");
    load();
  }

  const nameFor = (id: string) => saccos.find((s) => s.id === id)?.name ?? "SACCO";

  return (
    <div className="rounded-lg border border-dashed border-border bg-secondary/60 p-3 text-xs">
      <div className="font-medium text-foreground">Prefer joining a SACCO?</div>
      <p className="mt-1 text-muted-foreground">
        Request to join a SACCO and get assigned a vehicle once approved. A Ksh 1,000 joining fee
        applies.
      </p>
      {myReqs.length > 0 && (
        <ul className="mt-2 grid gap-1">
          {myReqs.map((r) => (
            <li
              key={r.sacco_id}
              className="flex items-center justify-between rounded-md bg-background px-2 py-1"
            >
              <span>{nameFor(r.sacco_id)}</span>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium capitalize ${r.status === "approved" ? "bg-primary text-primary-foreground" : r.status === "rejected" ? "bg-destructive text-destructive-foreground" : "bg-accent text-accent-foreground"}`}
              >
                {r.status}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 grid gap-1.5">
        <select
          value={saccoId}
          onChange={(e) => setSaccoId(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-2 py-1.5"
        >
          <option value="">— pick a SACCO —</option>
          {saccos.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Your phone (e.g. 0712 345 678)"
          className="w-full rounded-md border border-input bg-background px-2 py-1.5"
        />
        <input
          value={idNumber}
          onChange={(e) => setIdNumber(e.target.value)}
          placeholder="National ID number"
          className="w-full rounded-md border border-input bg-background px-2 py-1.5"
        />
        <input
          value={license}
          onChange={(e) => setLicense(e.target.value)}
          placeholder="Driving license number"
          className="w-full rounded-md border border-input bg-background px-2 py-1.5"
        />
        <div className="flex gap-3 rounded-md bg-background px-2 py-1.5">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              checked={bringsOwnVehicle}
              onChange={() => setBringsOwnVehicle(true)}
              className="accent-primary"
            />
            Own vehicle
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              checked={!bringsOwnVehicle}
              onChange={() => setBringsOwnVehicle(false)}
              className="accent-primary"
            />
            Assign me one
          </label>
        </div>
        {bringsOwnVehicle && (
          <input
            value={plate}
            onChange={(e) => setPlate(e.target.value)}
            placeholder="Plate (e.g. KDA 123A)"
            className="w-full rounded-md border border-input bg-background px-2 py-1.5"
          />
        )}
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional)"
          className="w-full rounded-md border border-input bg-background px-2 py-1.5"
        />
        <button
          type="button"
          disabled={busy}
          onClick={submit}
          className="rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground disabled:opacity-60"
        >
          {busy ? "Sending..." : "Pay Ksh 1,000 & send request"}
        </button>
      </div>
    </div>
  );
}

function RegisterOwnVehicle({ onCreated }: { onCreated: (v: Vehicle) => void }) {
  const [open, setOpen] = useState(false);
  const [plate, setPlate] = useState("");
  const [capacity, setCapacity] = useState("14");
  const [type, setType] = useState<"matatu_14" | "matatu_25" | "bus_33" | "bus_51">("matatu_14");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!plate.trim()) return toast.error("Enter a plate number");
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      setBusy(false);
      return;
    }
    await supabase.rpc("claim_role", { _role: "driver" });
    const { data, error } = await supabase
      .from("vehicles")
      .insert({
        plate_number: plate.trim().toUpperCase(),
        capacity: Number(capacity),
        vehicle_type: type,
        driver_id: u.user.id,
        sacco_id: null,
      })
      .select("id,plate_number,capacity")
      .single();
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Vehicle registered");
    onCreated(data as Vehicle);
    setPlate("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-dashed border-border bg-secondary/60 p-3 text-left text-xs"
      >
        <div className="font-medium text-foreground">Register your own vehicle</div>
        <div className="mt-0.5 text-muted-foreground">
          Independent driver? Add your matatu directly (no SACCO required).
        </div>
      </button>
    );
  }
  return (
    <div className="grid gap-2 rounded-lg border border-border bg-secondary/60 p-3 text-xs">
      <input
        value={plate}
        onChange={(e) => setPlate(e.target.value)}
        placeholder="Plate (e.g. KDA 123A)"
        className="rounded-md border border-input bg-background px-2 py-1.5"
      />
      <div className="flex gap-2">
        <select
          value={type}
          onChange={(e) =>
            setType(e.target.value as "matatu_14" | "matatu_25" | "bus_33" | "bus_51")
          }
          className="flex-1 rounded-md border border-input bg-background px-2 py-1.5"
        >
          <option value="matatu_14">Matatu · 14</option>
          <option value="matatu_25">Matatu · 25</option>
          <option value="bus_33">Bus · 33</option>
          <option value="bus_51">Bus · 51</option>
        </select>
        <input
          type="number"
          min={1}
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
          className="w-20 rounded-md border border-input bg-background px-2 py-1.5"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={submit}
          className="flex-1 rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save vehicle"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-border px-3 py-1.5"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
