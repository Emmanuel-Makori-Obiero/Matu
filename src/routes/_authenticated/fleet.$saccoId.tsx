import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Bus, Plus, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/matu/AppShell";

type Vehicle = {
  id: string;
  plate_number: string;
  capacity: number;
  nickname: string | null;
  vehicle_type: string;
  driver_id: string | null;
};
type Sacco = { id: string; name: string };
type LiveTrip = {
  id: string;
  fare: number;
  status: string;
  vehicle_id: string;
  route_id: string;
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

  async function loadLive(vehicleIds: string[]) {
    if (vehicleIds.length === 0) return setLiveTrips([]);
    const { data } = await supabase
      .from("trips")
      .select("id,fare,status,vehicle_id,route_id,vehicles(plate_number),routes(name)")
      .in("vehicle_id", vehicleIds)
      .in("status", ["boarding", "in_transit"]);
    setLiveTrips((data ?? []) as unknown as LiveTrip[]);
  }

  async function load() {
    const [{ data: s }, { data: v }] = await Promise.all([
      supabase.from("saccos").select("id,name").eq("id", saccoId).maybeSingle(),
      supabase
        .from("vehicles")
        .select("id,plate_number,capacity,nickname,vehicle_type,driver_id")
        .eq("sacco_id", saccoId)
        .order("plate_number"),
    ]);
    if (s) setSacco(s as Sacco);
    const vs = (v ?? []) as Vehicle[];
    setVehicles(vs);
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
    // Look up profile by phone or by trying user_roles+profile — we accept a phone match.
    const { data: prof } = await supabase
      .from("profiles")
      .select("id,phone,full_name")
      .eq("phone", driverEmail.trim())
      .maybeSingle();
    if (!prof) return toast.error("No user found with that phone. Ask the driver to sign up first.");
    // Note: driver role must be self-claimed by the driver on sign-up.
    const { error } = await supabase.from("vehicles").update({ driver_id: prof.id }).eq("id", vehicleId);
    if (error) return toast.error(error.message);
    toast.success(`Assigned ${prof.full_name ?? "driver"}`);
    setAssignFor(null);
    setDriverEmail("");
    load();
  }

  return (
    <AppShell title={sacco?.name ?? "Fleet"} subtitle="Vehicles, drivers, and assignments.">
      <div className="mb-4">
        <Link to="/fleet" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <ArrowLeft className="size-4" /> All SACCOs
        </Link>
      </div>

      <section className="rounded-2xl border border-border bg-surface p-5">
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
    </AppShell>

  );
}
