import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, MapPin, Bell, Play, Square, DollarSign, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/matu/AppShell";
import { RouteMap, type MapStage } from "@/components/matu/RouteMap";

type Vehicle = { id: string; plate_number: string; capacity: number };
type RouteRow = { id: string; name: string; base_fare: number | null };
type Stage = { id: string; name: string; lat: number; lng: number; order_index: number };
type ActiveTrip = { id: string; fare: number; status: string; route_id: string; vehicle_id: string };
type BookingWithProfile = { id: string; seat_number: number | null; status: string; passenger_id: string };
type AlertRow = { id: string; type: string; message: string | null; created_at: string; passenger_id: string };

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
        supabase.from("stages").select("id,name,lat,lng,order_index").eq("route_id", trip.route_id).order("order_index"),
        supabase.from("bookings").select("id,seat_number,status,passenger_id").eq("trip_id", trip.id),
        supabase.from("alerts").select("id,type,message,created_at,passenger_id").eq("trip_id", trip.id).order("created_at", { ascending: false }),
      ]);
      setStages((s ?? []) as Stage[]);
      setBookings((b ?? []) as BookingWithProfile[]);
      setAlerts((a ?? []) as AlertRow[]);
    })();

    const ch = supabase
      .channel(`trip-${trip.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings", filter: `trip_id=eq.${trip.id}` }, async () => {
        const { data } = await supabase.from("bookings").select("id,seat_number,status,passenger_id").eq("trip_id", trip.id);
        setBookings((data ?? []) as BookingWithProfile[]);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "alerts", filter: `trip_id=eq.${trip.id}` }, (payload) => {
        setAlerts((prev) => [payload.new as AlertRow, ...prev]);
        toast.info(`Passenger alert: ${(payload.new as AlertRow).type}`);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [trip]);

  // GPS broadcasting while trip is active
  useEffect(() => {
    if (!trip) return;
    if (!("geolocation" in navigator)) return;
    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        await supabase
          .from("trips")
          .update({ current_lat: pos.coords.latitude, current_lng: pos.coords.longitude })
          .eq("id", trip.id);
      },
      (err) => console.warn("geo error", err),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [trip]);

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
    await supabase.from("trips").update({ status: "completed", ended_at: new Date().toISOString() }).eq("id", trip.id);
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
      .insert({ route_id: trip.route_id, name: newStageName.trim(), lat, lng, order_index: nextOrder, added_by: u.user.id })
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
      <AppShell title="Start a trip" subtitle="Pick your vehicle and route to begin broadcasting to passengers.">
        <div className="mb-4">
          <Link to="/drive" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
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
            <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} required className="w-full rounded-md border border-input bg-background px-3 py-2">
              <option value="">— select —</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plate_number} ({v.capacity} seats)
                </option>
              ))}
            </select>
            {vehicles.length === 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                No vehicles yet. Ask your SACCO to assign one to you.
              </p>
            )}
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Route</span>
            <select value={routeId} onChange={(e) => setRouteId(e.target.value)} required className="w-full rounded-md border border-input bg-background px-3 py-2">
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
            <span className="mt-1 block text-xs text-muted-foreground">Agree with the conductor, then set it here.</span>
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
          <RouteMap
            stages={stages}
            onMapClick={addStage}
          />
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
                <button onClick={() => updateFare(Math.max(10, trip.fare - 10))} className="rounded-md border border-border px-2 py-1 text-sm">−10</button>
                <button onClick={() => updateFare(trip.fare + 10)} className="rounded-md border border-border px-2 py-1 text-sm">+10</button>
              </div>
            </div>
            <button
              onClick={toggleTransit}
              className="mt-3 w-full rounded-md border border-border px-3 py-2 text-sm font-medium"
            >
              <DollarSign className="mr-1 inline size-4" />
              {trip.status === "boarding" ? "Boarding → mark in transit" : "In transit → back to boarding"}
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
            {bookings.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No bookings yet.</p>
            ) : (
              <ul className="mt-3 grid gap-1 text-sm">
                {bookings.map((b) => (
                  <li key={b.id} className="flex items-center justify-between rounded-md bg-background px-3 py-1.5">
                    <span>Passenger · seat {b.seat_number ?? "—"}</span>
                    <span className="text-xs text-muted-foreground">{b.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="font-display text-lg font-semibold">Alerts</h2>
            {alerts.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No alerts.</p>
            ) : (
              <ul className="mt-3 grid gap-2 text-sm">
                {alerts.slice(0, 5).map((a) => (
                  <li key={a.id} className="flex items-start gap-2 rounded-md bg-background px-3 py-2">
                    <Bell className="mt-0.5 size-4 text-accent" />
                    <div>
                      <div className="font-medium">{a.type.replace("_", " ")}</div>
                      {a.message && <div className="text-xs text-muted-foreground">{a.message}</div>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="font-display text-lg font-semibold">Stages ({stages.length})</h2>
            <ol className="mt-2 grid gap-1 text-sm">
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
