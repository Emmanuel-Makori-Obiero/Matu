import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bus, Users, Map, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/matu/AppShell";

type Sacco = { id: string; name: string; registration_number: string | null };

export const Route = createFileRoute("/_authenticated/fleet/")({
  component: SaccoHome,
});

function SaccoHome() {
  const [saccos, setSaccos] = useState<Sacco[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [reg, setReg] = useState("");
  const [totals, setTotals] = useState({ vehicles: 0, drivers: 0, routes: 0 });

  async function load() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data } = await supabase
      .from("saccos")
      .select("id,name,registration_number")
      .eq("owner_id", u.user.id);
    const list = (data ?? []) as Sacco[];
    setSaccos(list);
    setLoading(false);

    const ids = list.map((s) => s.id);
    if (ids.length) {
      const [{ data: v }, { data: r }] = await Promise.all([
        supabase.from("vehicles").select("id,driver_id").in("sacco_id", ids),
        supabase.from("routes").select("id").in("sacco_id", ids),
      ]);
      const drivers = new Set((v ?? []).map((x: any) => x.driver_id).filter(Boolean));
      setTotals({ vehicles: (v ?? []).length, drivers: drivers.size, routes: (r ?? []).length });
    } else {
      setTotals({ vehicles: 0, drivers: 0, routes: 0 });
    }
  }
  useEffect(() => { load(); }, []);

  async function createSacco(e: React.FormEvent) {
    e.preventDefault();
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    // Ensure user has sacco_admin role (RLS requires it) — via secure RPC.
    await supabase.rpc("claim_role", { _role: "sacco_admin" });
    const { error } = await supabase.from("saccos").insert({
      name: name.trim(),
      registration_number: reg.trim() || null,
      owner_id: u.user.id,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("SACCO created");
    setName(""); setReg(""); setCreating(false);
    load();
  }

  return (
    <AppShell
      title="SACCO dashboard"
      subtitle="Manage your vehicles, drivers, and routes from one place."
      accent="primary"
    >
      <div className="grid gap-5">
        <div className="rounded-2xl border border-dashed border-border bg-surface p-6 text-sm text-muted-foreground">
          <strong className="text-foreground">Coming next:</strong> add vehicles & assign drivers, define SACCO routes,
          live fleet map, and revenue summaries (M-Pesa escrow coming after Phase 4).
        </div>

        <section className="rounded-2xl border border-border bg-surface p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold">Your SACCOs</h2>
            {!creating && (
              <button
                onClick={() => setCreating(true)}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
              >
                <Plus className="size-4" /> Register SACCO
              </button>
            )}
          </div>

          {creating && (
            <form onSubmit={createSacco} className="mt-4 grid gap-3 rounded-xl bg-secondary p-4 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-sm font-medium">SACCO name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} required
                  className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm" />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-sm font-medium">Registration # (optional)</span>
                <input value={reg} onChange={(e) => setReg(e.target.value)}
                  className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm" />
              </label>
              <div className="flex gap-2 sm:col-span-2">
                <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Create</button>
                <button type="button" onClick={() => setCreating(false)} className="rounded-md border border-border px-4 py-2 text-sm">Cancel</button>
              </div>
            </form>
          )}

          {loading ? (
            <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
          ) : saccos.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No SACCOs yet. Register your first one to start adding vehicles.</p>
          ) : (
            <ul className="mt-4 grid gap-3">
              {saccos.map((s) => (
                <li key={s.id}>
                  <Link
                    to="/fleet/$saccoId"
                    params={{ saccoId: s.id }}
                    className="flex items-center justify-between rounded-xl border border-border bg-background p-4 hover:border-primary"
                  >
                    <div>
                      <div className="font-display text-lg font-semibold">{s.name}</div>
                      <div className="text-xs text-muted-foreground">Reg: {s.registration_number ?? "—"}</div>
                    </div>
                    <div className="flex gap-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><Bus className="size-3" /> Manage fleet →</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="grid gap-4 md:grid-cols-3">
          <Card icon={<Bus />} title="Vehicles" value={String(totals.vehicles)} />
          <Card icon={<Users />} title="Drivers" value={String(totals.drivers)} />
          <Card icon={<Map />} title="Routes" value={String(totals.routes)} />
        </div>
        <p className="text-xs text-muted-foreground">
          Tip: open a SACCO above to add vehicles and assign drivers (by their sign-up phone number).
        </p>
      </div>
    </AppShell>
  );
}

function Card({ icon, title, value }: { icon: React.ReactNode; title: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="grid size-7 place-items-center rounded-md bg-accent/30 text-accent-foreground">{icon}</span>
        {title}
      </div>
      <div className="mt-3 font-display text-3xl font-bold">{value}</div>
    </div>
  );
}
