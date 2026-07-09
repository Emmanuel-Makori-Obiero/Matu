// FILE: src/components/matu/LeaveNowBanner.tsx
// Tells the passenger when to leave for their pickup stage, based on:
//   - how long the bus (live GPS) takes to reach the stage
//   - how long the passenger takes to walk from where they are now to that stage
// Both legs use OSRM's free public routing API (router.project-osrm.org) — no key,
// no billing. Note: unlike Google's DirectionsService, OSRM's public demo server does
// not factor in live traffic; the bus ETA is a driving-time estimate only.
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Footprints, Navigation2, RefreshCw } from "lucide-react";

type LatLng = { lat: number; lng: number };
type Stage = { lat: number; lng: number; name: string };
type OsrmProfile = "walking" | "driving";

// Recomputing on every 5s GPS tick would hammer the free OSRM server for no real
// benefit — ETAs don't meaningfully change that often. Refresh the bus leg on this
// cadence instead; walking time is recomputed only when the passenger's location or
// the target stage changes (both are far less volatile).
const BUS_ETA_REFRESH_MS = 20_000;

async function osrmDurationSeconds(
  profile: OsrmProfile,
  origin: LatLng,
  destination: LatLng,
): Promise<number | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/${profile}/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=false`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as { routes?: Array<{ duration: number }> };
    return data.routes?.[0]?.duration ?? null;
  } catch {
    return null;
  }
}

export function LeaveNowBanner({ busPos, stage }: { busPos: LatLng | null; stage: Stage | null }) {
  const [passengerPos, setPassengerPos] = useState<LatLng | null>(null);
  const [geoError, setGeoError] = useState(false);
  const [walkMinutes, setWalkMinutes] = useState<number | null>(null);
  const [busMinutes, setBusMinutes] = useState<number | null>(null);
  const [directionsError, setDirectionsError] = useState(false);
  const busPosRef = useRef(busPos);
  busPosRef.current = busPos;

  function locateMe() {
    setGeoError(false);
    if (!("geolocation" in navigator)) return setGeoError(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => setPassengerPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setGeoError(true),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  useEffect(() => {
    locateMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Walking leg: passenger -> stage. Recomputed only when either endpoint changes.
  useEffect(() => {
    if (!passengerPos || !stage) return;
    let cancelled = false;
    (async () => {
      const seconds = await osrmDurationSeconds("walking", passengerPos, {
        lat: stage.lat,
        lng: stage.lng,
      });
      if (cancelled) return;
      if (seconds == null) {
        setDirectionsError(true);
      } else {
        setWalkMinutes(Math.round(seconds / 60));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [passengerPos, stage]);

  // Bus leg: live bus position -> stage. Refreshed on an interval rather than every
  // GPS update, to keep the free OSRM server usage reasonable.
  useEffect(() => {
    if (!stage) return;

    async function computeBusEta() {
      const pos = busPosRef.current;
      if (!pos) return;
      const seconds = await osrmDurationSeconds("driving", pos, {
        lat: stage!.lat,
        lng: stage!.lng,
      });
      if (seconds == null) {
        setDirectionsError(true);
      } else {
        setBusMinutes(Math.round(seconds / 60));
      }
    }

    computeBusEta();
    const iv = setInterval(computeBusEta, BUS_ETA_REFRESH_MS);
    return () => clearInterval(iv);
  }, [stage, busPos != null]);

  if (!stage) return null;

  if (!busPos) {
    return (
      <div className="rounded-xl border border-border bg-surface p-3 text-xs text-muted-foreground">
        Waiting for the driver to start sharing live location…
      </div>
    );
  }

  if (geoError) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface p-3 text-xs">
        <span className="text-muted-foreground">
          Turn on location access to see when to leave for {stage.name}.
        </span>
        <button
          onClick={locateMe}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 font-medium hover:bg-secondary"
        >
          <RefreshCw className="size-3" /> Retry
        </button>
      </div>
    );
  }

  if (directionsError && walkMinutes == null && busMinutes == null) {
    return (
      <div className="flex items-center gap-1.5 rounded-xl border border-border bg-surface p-3 text-xs text-muted-foreground">
        <AlertTriangle className="size-3.5 shrink-0" /> Couldn't calculate timing right now.
      </div>
    );
  }

  if (walkMinutes == null || busMinutes == null) {
    return (
      <div className="rounded-xl border border-border bg-surface p-3 text-xs text-muted-foreground">
        Calculating when you should leave…
      </div>
    );
  }

  const leaveInMinutes = busMinutes - walkMinutes;
  const urgent = leaveInMinutes <= 2;

  return (
    <div
      className={`rounded-xl border p-3 ${urgent ? "border-destructive/50 bg-destructive/10" : "border-primary/40 bg-primary/10"}`}
    >
      <div className={`text-sm font-semibold ${urgent ? "text-destructive" : "text-primary"}`}>
        {leaveInMinutes <= 0
          ? "Leave now to catch your matatu!"
          : `Leave for ${stage.name} in ${leaveInMinutes} min`}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Navigation2 className="size-3" /> Bus arrives in {busMinutes} min
        </span>
        <span className="inline-flex items-center gap-1">
          <Footprints className="size-3" /> {walkMinutes} min walk to {stage.name}
        </span>
      </div>
    </div>
  );
}
