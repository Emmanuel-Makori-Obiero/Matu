import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { MapPin, Bus, Search, ArrowRightLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/matu/AppShell";

type RouteRow = { id: string; name: string; origin: string; destination: string; base_fare: number | null };

export const Route = createFileRoute("/_authenticated/ride/")({
  component: PassengerHome,
});

function PassengerHome() {
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    supabase.from("routes").select("id,name,origin,destination,base_fare").order("name").then(({ data }) => {
      setRoutes((data ?? []) as RouteRow[]);
      setLoading(false);
    });
  }, []);

  const places = useMemo(() => {
    const s = new Set<string>();
    routes.forEach((r) => { s.add(r.origin); s.add(r.destination); });
    return Array.from(s).sort();
  }, [routes]);

  const filtered = useMemo(() => {
    const f = from.trim().toLowerCase();
    const t = to.trim().toLowerCase();
    return routes.filter((r) => {
      const o = r.origin.toLowerCase();
      const d = r.destination.toLowerCase();
      const matchesF = !f || o.includes(f) || d.includes(f);
      const matchesT = !t || d.includes(t) || o.includes(t);
      return matchesF && matchesT;
    });
  }, [routes, from, to]);

  return (
    <AppShell title="Where to today?" subtitle="Pick your pickup and destination to find matatus on your route.">
      <div className="grid gap-5">
        {/* From / To selector */}
        <section className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr_auto]">
            <PlaceField icon={<div className="size-2.5 rounded-full bg-accent" />} label="From" value={from} onChange={setFrom} options={places} placeholder="Pickup stage or town" />
            <button
              type="button"
              onClick={() => { const a = from; setFrom(to); setTo(a); }}
              aria-label="Swap"
              className="my-1 hidden self-center rounded-md border border-border bg-background p-2 hover:bg-secondary sm:inline-flex"
            >
              <ArrowRightLeft className="size-4" />
            </button>
            <PlaceField icon={<div className="size-2.5 rounded-full bg-primary" />} label="To" value={to} onChange={setTo} options={places} placeholder="Where are you headed?" />
            <button
              type="button"
              onClick={() => { setFrom(""); setTo(""); }}
              className="self-end rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
            >
              <Search className="mr-1 inline size-4" /> Search
            </button>
          </div>
        </section>

        <h2 className="font-display text-xl font-semibold">
          {from || to ? `Matching routes (${filtered.length})` : "Popular routes"}
        </h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading routes…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No routes match yet. Try a different stage — or clear your search to see everything.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {filtered.map((r) => (
              <div key={r.id} className="rounded-xl border border-border bg-surface p-4 shadow-soft">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-display text-lg font-semibold">{r.name}</div>
                    <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="size-3" /> {r.origin} → {r.destination}
                    </div>
                  </div>
                  <div className="rounded-md bg-accent/30 px-2 py-1 text-xs font-semibold text-accent-foreground">
                    From KSh {r.base_fare ?? "—"}
                  </div>
                </div>
                <Link
                  to="/ride/$routeId"
                  params={{ routeId: r.id }}
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary"
                >
                  <Bus className="size-4" /> See matatus
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function PlaceField({
  label, value, onChange, options, placeholder, icon,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: string[]; placeholder?: string; icon?: React.ReactNode;
}) {
  const listId = `places-${label.toLowerCase()}`;
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {icon} {label}
      </span>
      <input
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none ring-ring focus:ring-2"
      />
      <datalist id={listId}>
        {options.map((o) => <option key={o} value={o} />)}
      </datalist>
    </label>
  );
}
