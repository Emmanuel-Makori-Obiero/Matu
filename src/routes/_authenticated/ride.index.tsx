import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MapPin, Bus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/matu/AppShell";

type RouteRow = { id: string; name: string; origin: string; destination: string; base_fare: number | null };

export const Route = createFileRoute("/_authenticated/ride/")({
  component: PassengerHome,
});

function PassengerHome() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("routes").select("id,name,origin,destination,base_fare").order("name").then(({ data }) => {
      setRoutes((data ?? []) as Route[]);
      setLoading(false);
    });
  }, []);

  return (
    <AppShell title="Where to today?" subtitle="Pick a route to see live matatus and book a seat.">
      <div className="grid gap-5">
        <div className="rounded-2xl border border-dashed border-border bg-surface p-6 text-sm text-muted-foreground">
          <strong className="text-foreground">Coming next:</strong> live matatu locations on a map, seat booking,
          and stage-proximity alerts. The foundation is in place — your routes and stages are loaded below.
        </div>

        <h2 className="font-display text-xl font-semibold">Popular routes</h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading routes…</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {routes.map((r) => (
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
                <button className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                  <Bus className="size-4" /> See matatus
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
