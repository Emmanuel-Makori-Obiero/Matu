// FILE: src/components/matu/LeaveNowBanner.tsx
// Tells the passenger when to leave for their pickup stage, based on:
//   - how long the bus (live GPS) takes to reach the stage, accounting for real
//     traffic conditions
//   - how long the passenger takes to walk from where they are now to that stage
// Both legs use google.maps.DirectionsService (part of the already-loaded Maps JS SDK,
// authenticated via the same browser key — no separate REST call/CORS setup needed).
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Footprints, Navigation2, RefreshCw } from "lucide-react";
import { loadGoogleMaps } from "@/lib/google-maps";

type LatLng = { lat: number; lng: number };
type Stage = { lat: number; lng: number; name: string };

// Recomputing on every 5s GPS tick would burn Directions API quota fast for no real
// benefit — traffic-aware ETAs don't meaningfully change that often. Refresh the bus
// leg on this cadence instead; walking time is recomputed only when the passenger's
// location or the target stage changes (both are far less volatile).
const BUS_ETA_REFRESH_MS = 20_000;

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
      try {
        const g = await loadGoogleMaps();
        const service = new g.maps.DirectionsService();
        const result = await service.route({
          origin: passengerPos,
          destination: { lat: stage.lat, lng: stage.lng },
          travelMode: g.maps.TravelMode.WALKING,
        });
        if (cancelled) return;
        const seconds = result.routes[0]?.legs[0]?.duration?.value;
        setWalkMinutes(seconds != null ? Math.round(seconds / 60) : null);
      } catch {
        if (!cancelled) setDirectionsError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [passengerPos, stage]);

  // Bus leg: live bus position -> stage, with real-time traffic. Refreshed on an
  // interval rather than every GPS update, to keep Directions API usage sane.
  useEffect(() => {
    if (!stage) return;

    async function computeBusEta() {
      const pos = busPosRef.current;
      if (!pos) return;
      try {
        const g = await loadGoogleMaps();
        const service = new g.maps.DirectionsService();
        const result = await service.route({
          origin: pos,
          destination: { lat: stage!.lat, lng: stage!.lng },
          travelMode: g.maps.TravelMode.DRIVING,
          drivingOptions: {
            departureTime: new Date(),
            trafficModel: g.maps.TrafficModel.BEST_GUESS,
          },
        });
        const leg = result.routes[0]?.legs[0];
        const seconds = leg?.duration_in_traffic?.value ?? leg?.duration?.value;
        setBusMinutes(seconds != null ? Math.round(seconds / 60) : null);
      } catch {
        setDirectionsError(true);
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
          <Navigation2 className="size-3" /> Bus arrives in {busMinutes} min (live traffic)
        </span>
        <span className="inline-flex items-center gap-1">
          <Footprints className="size-3" /> {walkMinutes} min walk to {stage.name}
        </span>
      </div>
    </div>
  );
}
