import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Wallet, MapPin, Users, Play } from "lucide-react";
import { AppShell } from "@/components/matu/AppShell";
import { supabase } from "@/integrations/supabase/client";

type ActiveTripSummary = {
  id: string;
  fare: number;
  status: string;
  plate_number: string;
  capacity: number;
  seatsBooked: number;
};

function DriverHome() {
  const [activeTrip, setActiveTrip] = useState<ActiveTripSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadActiveTrip() {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return setLoading(false);

      const { data: trip } = await supabase
        .from("trips")
        .select("id,fare,status,vehicle_id")
        .eq("driver_id", u.user.id)
        .in("status", ["boarding", "in_transit"])
        .maybeSingle();

      if (!trip) {
        if (!cancelled) {
          setActiveTrip(null);
          setLoading(false);
        }
        return;
      }

      const [{ data: vehicle }, { data: bookings }] = await Promise.all([
        supabase
          .from("vehicles")
          .select("plate_number,capacity")
          .eq("id", trip.vehicle_id)
          .single(),
        supabase.from("bookings").select("id,status").eq("trip_id", trip.id),
      ]);

      if (cancelled) return;
      const seatsBooked = (bookings ?? []).filter((b) => b.status !== "cancelled").length;
      setActiveTrip({
        id: trip.id,
        fare: trip.fare,
        status: trip.status,
        plate_number: vehicle?.plate_number ?? "—",
        capacity: vehicle?.capacity ?? 14,
        seatsBooked,
      });
      setLoading(false);
    }

    loadActiveTrip();

    // Keep this in sync while the driver sits on the dashboard tab, not just
    // on the dedicated trip page — bookings can land any time.
    const iv = setInterval(loadActiveTrip, 10_000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, []);

  return (
    <AppShell
      title="Driver dashboard"
      subtitle="Start your shift, set today's fare, and broadcast your location to passengers."
    >
      <div className="grid gap-5">
        <div className="grid gap-4 md:grid-cols-3">
          <Link to="/drive/trip">
            <Tile
              icon={<Play className="size-5" />}
              title="Start trip"
              desc="Pick your vehicle & route, set fare, hit go."
            />
          </Link>
          <Link to="/drive/trip">
            <Tile
              icon={<Wallet className="size-5" />}
              title="Today's fare"
              desc="Agree with the conductor — adaptive pricing."
            />
          </Link>
          <Link to="/drive/trip">
            <Tile
              icon={<MapPin className="size-5" />}
              title="Add a stage"
              desc="Tap the map to mark a new stage on your route."
            />
          </Link>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-6">
          <h2 className="font-display text-xl font-semibold">Live passengers</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Seat occupancy for your current trip, live.
          </p>

          {loading ? (
            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="size-4" /> Checking for an active trip…
            </div>
          ) : !activeTrip ? (
            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="size-4" /> No active trip yet
            </div>
          ) : (
            (() => {
              const left = Math.max(activeTrip.capacity - activeTrip.seatsBooked, 0);
              const isLow = left <= 3 && left > 0;
              const isFull = left === 0;
              return (
                <Link to="/drive/trip" className="mt-4 block">
                  <div
                    className={`flex items-center justify-between rounded-md px-3 py-2.5 text-sm font-semibold ${
                      isFull
                        ? "bg-destructive/15 text-destructive"
                        : isLow
                          ? "bg-amber-500/15 text-amber-600"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Users className="size-4" />
                      {activeTrip.plate_number} · {activeTrip.seatsBooked} of {activeTrip.capacity}{" "}
                      seats booked
                    </span>
                    <span>{isFull ? "Full" : `${left} left`}</span>
                  </div>
                  <div className="mt-1.5 text-xs text-muted-foreground">
                    {activeTrip.status === "boarding" ? "Boarding" : "In transit"} · Tap to manage
                  </div>
                </Link>
              );
            })()
          )}
        </div>
      </div>
    </AppShell>
  );
}

export const Route = createFileRoute("/_authenticated/drive/")({
  component: DriverHome,
});

function Tile({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <button className="rounded-xl border border-border bg-surface p-5 text-left transition hover:shadow-soft">
      <div className="grid size-10 place-items-center rounded-lg bg-primary text-primary-foreground">
        {icon}
      </div>
      <div className="mt-3 font-display text-lg font-semibold">{title}</div>
      <div className="mt-1 text-sm text-muted-foreground">{desc}</div>
    </button>
  );
}
