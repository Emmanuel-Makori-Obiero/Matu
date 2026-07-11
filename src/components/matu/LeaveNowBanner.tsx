// FILE: src/components/matu/LeaveNowBanner.tsx
// Tells the passenger when to leave for their pickup stage, based on:
//   - how long the bus takes to reach the stage — via useLiveTrafficEta, the same
//     shared hook the map's "arriving in X min" label uses, so the two numbers
//     never disagree with each other
//   - how long the passenger takes to walk from where they are now to that stage,
//     via OSRM's free public routing API (traffic doesn't matter for walking)
import { useEffect, useState } from "react";
import { AlertTriangle, Footprints, Navigation2, RefreshCw } from "lucide-react";
import { osrmDurationSeconds, useLiveTrafficEta, type LatLng } from "@/lib/traffic-eta";

type Stage = { lat: number; lng: number; name: string };

export function LeaveNowBanner({ busPos, stage }: { busPos: LatLng | null; stage: Stage | null }) {
  const [passengerPos, setPassengerPos] = useState<LatLng | null>(null);
  const [geoError, setGeoError] = useState(false);
  const [walkMinutes, setWalkMinutes] = useState<number | null>(null);
  const [walkError, setWalkError] = useState(false);

  const destination = stage ? { lat: stage.lat, lng: stage.lng } : null;
  const {
    minutes: busMinutes,
    delayed: trafficDelayed,
    error: busError,
  } = useLiveTrafficEta(busPos, destination);

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
        setWalkError(true);
      } else {
        setWalkError(false);
        setWalkMinutes(Math.round(seconds / 60));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [passengerPos, stage]);

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

  if (busError && walkError && walkMinutes == null && busMinutes == null) {
    return (
      <div className="flex items-center gap-1.5 rounded-xl border border-border bg-surface p-3 text-xs text-muted-foreground">
        <AlertTriangle className="size-3.5 shrink-0" /> Couldn't calculate timing right now.
      </div>
    );
  }

  // Show what we already have rather than waiting on both legs — the bus ETA
  // (from Mapbox) usually resolves well before the walking time does, since
  // walking depends on getting a GPS fix and a browser permission prompt first.
  if (busMinutes == null) {
    return (
      <div className="rounded-xl border border-border bg-surface p-3 text-xs text-muted-foreground">
        Calculating when you should leave…
      </div>
    );
  }

  if (walkMinutes == null) {
    return (
      <div className="rounded-xl border border-primary/40 bg-primary/10 p-3">
        <div className="text-sm font-semibold text-primary">Bus arrives in {busMinutes} min</div>
        <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
          {trafficDelayed && (
            <span className="font-medium text-amber-600">Delayed by traffic · </span>
          )}
          Working out your walking time to {stage.name}…
        </div>
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
          {trafficDelayed && (
            <span className="font-medium text-amber-600"> · delayed by traffic</span>
          )}
        </span>
        <span className="inline-flex items-center gap-1">
          <Footprints className="size-3" /> {walkMinutes} min walk to {stage.name}
        </span>
      </div>
    </div>
  );
}
