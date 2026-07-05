import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Bus, Map, Plus, Radio, UserPlus, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/matu/AppShell";
import { RouteMap, type MapVehicle } from "@/components/matu/RouteMap";
import { assignSaccoDriver } from "@/lib/fleet.functions";

type Vehicle = {
  id: string;
  plate_number: string;
  capacity: number;
  nickname: string | null;
  vehicle_type: string;
  driver_id: string | null;
};
type Sacco = { id: string; name: string };
type SaccoRoute = { id: string; name: string; origin: string; destination: string; base_fare: number | null };
type DriverRow = { driver_id: string | null; full_name: string | null; phone: string | null; vehicle_id: string; plate_number: string; status: string };
type JoinRequest = { id: string; driver_id: string; full_name: string | null; phone: string | null; note: string | null; status: string; created_at: string };
type LiveTrip = {
  id: string;
  fare: number;
  status: string;
  vehicle_id: string;
  route_id: string;
  current_lat: number | null;
  current_lng: number | null;
  vehicles: { plate_number: string } | null;
  routes: { name: string } | null;
};



export const Route = createFileRoute("/_authenticated/fleet/$saccoId")({
  component: FleetDetail,
});

function FleetDetail() {
  const { saccoId } = Route.useParams();
  const [sacco, setSacco] = useState<Sacco | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [adding, setAdding] = useState(false);
  const [plate, setPlate] = useState("");
  const [capacity, setCapacity] = useState("14");
  const [type, setType] = useState<"matatu_14" | "matatu_25" | "bus_33" | "bus_51">("matatu_14");
  const [nickname, setNickname] = useState("");
  const [assignFor, setAssignFor] = useState<string | null>(null);
  const [driverEmail, setDriverEmail] = useState("");
  const [liveTrips, setLiveTrips] = useState<LiveTrip[]>([]);
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [routes, setRoutes] = useState<SaccoRoute[]>([]);
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [addingRoute, setAddingRoute] = useState(false);
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [routeFare, setRouteFare] = useState("");

  async function loadLive(vehicleIds: string[]) {
    if (vehicleIds.length === 0) return setLiveTrips([]);
    const { data } = await supabase
      .from("trips")
      .select("id,fare,status,vehicle_id,route_id,current_lat,current_lng,vehicles(plate_number),routes(name)")
      .in("vehicle_id", vehicleIds)
      .in("status", ["boarding", "in_transit"]);
    setLiveTrips((data ?? []) as unknown as LiveTrip[]);
  }

  async function load() {
    const [{ data: s }, { data: v }, { data: d }, { data: r }, { data: jr }] = await Promise.all([
      supabase.from("saccos").select("id,name").eq("id", saccoId).maybeSingle(),
      supabase
        .from("vehicles")
        .select("id,plate_number,capacity,nickname,vehicle_type,driver_id")
        .eq("sacco_id", saccoId)
        .order("plate_number"),
      supabase.rpc("get_my_sacco_drivers", { _sacco_id: saccoId }),
      supabase.from("routes").select("id,name,origin,destination,base_fare").eq("sacco_id", saccoId).order("name"),
      supabase.rpc("list_sacco_join_requests", { _sacco_id: saccoId }),
    ]);
    if (s) setSacco(s as Sacco);
    const vs = (v ?? []) as Vehicle[];
    setVehicles(vs);
    setDrivers((d ?? []) as DriverRow[]);
    setRoutes((r ?? []) as SaccoRoute[]);
    setJoinRequests((jr ?? []) as JoinRequest[]);
    await loadLive(vs.map((x) => x.id));
  }
  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saccoId]);

  async function adjustFare(tripId: string, next: number) {
    const { error } = await supabase.from("trips").update({ fare: next }).eq("id", tripId);
    if (error) return toast.error(error.message);
    setLiveTrips((prev) => prev.map((t) => (t.id === tripId ? { ...t, fare: next } : t)));
    toast.success(`Fare set to KSh ${next}`);
  }

  async function addVehicle(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("vehicles").insert({
      sacco_id: saccoId,
      plate_number: plate.trim().toUpperCase(),
      capacity: Number(capacity),
      vehicle_type: type,
      nickname: nickname.trim() || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Vehicle added");
    setPlate("");
    setCapacity("14");
    setNickname("");
    setAdding(false);
    load();
  }

  async function assignDriver(vehicleId: string) {
    try {
      const data = await assignSaccoDriver({ data: { vehicleId, phone: driverEmail.trim() } });
      toast.success(`Assigned ${data.full_name ?? "driver"}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not assign driver");
      return;
    }
    setAssignFor(null);
    setDriverEmail("");
    load();
  }

  async function addRoute(e: React.FormEvent) {
    e.preventDefault();
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    await supabase.rpc("claim_role", { _role: "sacco_admin" });
    const name = `${origin.trim()} → ${destination.trim()}`;
    const { error } = await supabase.from("routes").insert({
      name,
      origin: origin.trim(),
      destination: destination.trim(),
      base_fare: routeFare ? Number(routeFare) : null,
      sacco_id: saccoId,
      created_by: u.user.id,
    });
    if (error) return toast.error(error.message);
    toast.success("Route added");
    setOrigin(""); setDestination(""); setRouteFare(""); setAddingRoute(false);
    load();
  }

  async function updateRouteFare(routeId: string, next: number) {
    const { error } = await supabase.from("routes").update({ base_fare: next }).eq("id", routeId);
    if (error) return toast.error(error.message);
    setRoutes((prev) => prev.map((r) => (r.id === routeId ? { ...r, base_fare: next } : r)));
  }



  async function approveJoin(id: string) {
    const { error } = await supabase.rpc("approve_driver_request", { _request_id: id });
    if (error) return toast.error(error.message);
    toast.success("Driver approved — assign them a vehicle below");
    load();
  }
  async function rejectJoin(id: string) {
    const { error } = await supabase.from("driver_join_requests").update({ status: "rejected" }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Request rejected");
    load();
  }


  const mapVehicles: MapVehicle[] = liveTrips
    .filter((t) => t.current_lat && t.current_lng)
    .map((t) => ({ id: t.id, lat: t.current_lat!, lng: t.current_lng!, label: t.vehicles?.plate_number ?? "Matatu" }));
  const todayRevenue = liveTrips.reduce((sum, t) => sum + Number(t.fare ?? 0), 0);

  return (
    <AppShell title={sacco?.name ?? "Fleet"} subtitle="Vehicles, drivers, and assignments.">
      <div className="mb-4">
        <Link to="/fleet" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <ArrowLeft className="size-4" /> All SACCOs
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Summary icon={<Bus />} label="Vehicles" value={vehicles.length} />
        <Summary icon={<Radio />} label="Live trips" value={liveTrips.length} />
        <Summary icon={<Wallet />} label="Live fares" value={`KSh ${todayRevenue}`} />
      </div>

      <section className="mt-5 rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold">Vehicles ({vehicles.length})</h2>
          {!adding && (
            <button
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
            >
              <Plus className="size-4" /> Add vehicle
            </button>
          )}
        </div>

        {adding && (
          <form onSubmit={addVehicle} className="mt-4 grid gap-3 rounded-xl bg-secondary p-4 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block font-medium">Plate number</span>
              <input required value={plate} onChange={(e) => setPlate(e.target.value)} className="w-full rounded-md border border-input bg-surface px-3 py-2" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Nickname (optional)</span>
              <input value={nickname} onChange={(e) => setNickname(e.target.value)} className="w-full rounded-md border border-input bg-surface px-3 py-2" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Type</span>
              <select value={type} onChange={(e) => setType(e.target.value as any)} className="w-full rounded-md border border-input bg-surface px-3 py-2">
                <option value="matatu_14">Matatu · 14 seats</option>
                <option value="matatu_25">Matatu · 25 seats</option>
                <option value="bus_33">Bus · 33 seats</option>
                <option value="bus_51">Bus · 51 seats</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Capacity</span>
              <input type="number" required min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} className="w-full rounded-md border border-input bg-surface px-3 py-2" />
            </label>
            <div className="flex gap-2 sm:col-span-2">
              <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Add</button>
              <button type="button" onClick={() => setAdding(false)} className="rounded-md border border-border px-4 py-2 text-sm">
                Cancel
              </button>
            </div>
          </form>
        )}

        {vehicles.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No vehicles yet.</p>
        ) : (
          <ul className="mt-4 grid gap-3">
            {vehicles.map((v) => (
              <li key={v.id} className="rounded-xl border border-border bg-background p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 font-display text-lg font-semibold">
                      <Bus className="size-4" /> {v.plate_number}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {v.nickname ?? "—"} · {v.vehicle_type.replace("_", " ")} · {v.capacity} seats
                    </div>
                    <div className="mt-1 text-xs">
                      Driver:{" "}
                      {v.driver_id ? <span className="text-primary">assigned</span> : <span className="text-muted-foreground">unassigned</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => setAssignFor(assignFor === v.id ? null : v.id)}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs"
                  >
                    <UserPlus className="size-3" /> {v.driver_id ? "Reassign" : "Assign driver"}
                  </button>
                </div>
                {assignFor === v.id && (
                  <div className="mt-3 flex gap-2 border-t border-border pt-3">
                    <input
                      placeholder="Driver's phone (e.g. 0712345678)"
                      value={driverEmail}
                      onChange={(e) => setDriverEmail(e.target.value)}
                      className="flex-1 rounded-md border border-input bg-surface px-2 py-1.5 text-xs"
                    />
                    <button
                      onClick={() => assignDriver(v.id)}
                      className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                    >
                      Assign
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-5 rounded-2xl border border-border bg-surface p-5">
        <h2 className="font-display text-xl font-semibold">Drivers</h2>
        {drivers.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Add a vehicle, then assign a driver by their sign-up phone number.</p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {drivers.map((d) => (
              <li key={d.vehicle_id} className="flex items-center justify-between rounded-xl border border-border bg-background p-3 text-sm">
                <div>
                  <div className="font-medium">{d.full_name ?? "Unassigned driver"}</div>
                  <div className="text-xs text-muted-foreground">{d.plate_number} · {d.phone ?? "no phone"}</div>
                </div>
                <span className="rounded-md bg-secondary px-2 py-1 text-xs capitalize">{d.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-5 rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold">SACCO routes ({routes.length})</h2>
          {!addingRoute && <button onClick={() => setAddingRoute(true)} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"><Plus className="size-4" /> Add route</button>}
        </div>
        {addingRoute && (
          <form onSubmit={addRoute} className="mt-4 grid gap-3 rounded-xl bg-secondary p-4 sm:grid-cols-4">
            <input required value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="From: Utawala" className="rounded-md border border-input bg-surface px-3 py-2 text-sm" />
            <input required value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="To: CBD" className="rounded-md border border-input bg-surface px-3 py-2 text-sm" />
            <input value={routeFare} onChange={(e) => setRouteFare(e.target.value)} type="number" min={10} placeholder="Fare" className="rounded-md border border-input bg-surface px-3 py-2 text-sm" />
            <div className="flex gap-2"><button className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">Save</button><button type="button" onClick={() => setAddingRoute(false)} className="rounded-md border border-border px-3 py-2 text-sm">Cancel</button></div>
          </form>
        )}
        <ul className="mt-4 grid gap-2">
          {routes.map((r) => (
            <li key={r.id} className="flex items-center justify-between rounded-xl border border-border bg-background p-3 text-sm">
              <span><Map className="mr-1 inline size-3" />{r.origin} → {r.destination}</span>
              <span className="flex items-center gap-2">
                <button onClick={() => updateRouteFare(r.id, Math.max(10, Number(r.base_fare ?? 10) - 10))} className="rounded-md border border-border px-2 py-1 text-xs">−</button>
                <strong>KSh {r.base_fare ?? "—"}</strong>
                <button onClick={() => updateRouteFare(r.id, Number(r.base_fare ?? 0) + 10)} className="rounded-md border border-border px-2 py-1 text-xs">+</button>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-5 rounded-2xl border border-border bg-surface p-5">
        <h2 className="font-display text-xl font-semibold">Live trips ({liveTrips.length})</h2>
        {liveTrips.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No active trips right now.</p>
        ) : (
          <ul className="mt-3 grid gap-3">
            {liveTrips.map((t) => (
              <li key={t.id} className="rounded-xl border border-border bg-background p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-display text-lg font-semibold">{t.vehicles?.plate_number ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{t.routes?.name ?? "—"} · {t.status}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => adjustFare(t.id, Math.max(10, t.fare - 10))} className="rounded-md border border-border px-2 py-1 text-sm">−10</button>
                    <div className="font-display text-xl font-bold">KSh {t.fare}</div>
                    <button onClick={() => adjustFare(t.id, t.fare + 10)} className="rounded-md border border-border px-2 py-1 text-sm">+10</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="mt-5 rounded-2xl border border-border bg-surface p-5">
        <h2 className="font-display text-xl font-semibold">Live fleet map</h2>
        <RouteMap stages={[]} vehicles={mapVehicles} className="mt-3 h-[360px] w-full rounded-2xl border border-border" />
      </section>
    </AppShell>

  );
}

function Summary({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return <div className="rounded-xl border border-border bg-surface p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div><div className="mt-2 font-display text-2xl font-bold">{value}</div></div>;
}
