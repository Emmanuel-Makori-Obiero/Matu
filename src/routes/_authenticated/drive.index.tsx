import { createFileRoute, Link } from "@tanstack/react-router";
import { Wallet, MapPin, Users, Play } from "lucide-react";
import { AppShell } from "@/components/matu/AppShell";

export const Route = createFileRoute("/_authenticated/drive/")({
  component: DriverHome,
});

function DriverHome() {
  return (
    <AppShell
      title="Driver dashboard"
      subtitle="Start your shift, set today's fare, and broadcast your location to passengers."
    >
      <div className="grid gap-5">
        <div className="rounded-2xl border border-dashed border-border bg-surface p-6 text-sm text-muted-foreground">
          <strong className="text-foreground">Coming next:</strong> start a trip, broadcast GPS, set
          adaptive fares, add stages on the fly, and manage seat bookings & alight requests.
        </div>

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
            Once you start a trip, bookings, seat occupancy, and alight requests appear here in real
            time.
          </p>
          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="size-4" /> No active trip yet
          </div>
        </div>
      </div>
    </AppShell>
  );
}

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
