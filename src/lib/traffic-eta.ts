// FILE: src/lib/traffic-eta.ts
// Single source of truth for "how long until the bus arrives" so every place
// that shows this number (the leave-now banner, the map's live label) computes
// it the same way, on the same cadence, and never disagrees with itself.
import { useEffect, useRef, useState } from "react";

export type LatLng = { lat: number; lng: number };
export type OsrmProfile = "walking" | "driving";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

// 10s keeps the "arriving in X min" label feeling live without hammering the
// Mapbox free tier (100k req/month) — at 10s per active passenger that's
// roughly 8,600 requests per passenger per day if they leave the trip screen
// open, so this is meant for "trip in progress" screens, not idle browsing.
export const TRAFFIC_ETA_REFRESH_MS = 10_000;

export async function osrmDurationSeconds(
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

// Mapbox's driving-traffic profile factors in current road conditions, unlike
// a plain driving-time estimate. Falls back to null (never throws) if the
// token is missing or the request fails.
export async function mapboxTrafficDurationSeconds(
  origin: LatLng,
  destination: LatLng,
): Promise<number | null> {
  if (!MAPBOX_TOKEN) return null;
  try {
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=false&access_token=${MAPBOX_TOKEN}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as { routes?: Array<{ duration: number }> };
    return data.routes?.[0]?.duration ?? null;
  } catch {
    return null;
  }
}

/**
 * Live, traffic-aware "minutes until the bus arrives" at a fixed stage.
 * Reads the vehicle's position from a ref internally so a fast-moving GPS
 * feed doesn't retrigger a full refetch loop — only the destination (a fixed
 * stage) restarts the interval; each tick reads whatever position is current.
 */
export function useLiveTrafficEta(busPos: LatLng | null, destination: LatLng | null) {
  const [minutes, setMinutes] = useState<number | null>(null);
  const [delayed, setDelayed] = useState(false);
  const [error, setError] = useState(false);
  const busPosRef = useRef(busPos);
  busPosRef.current = busPos;

  useEffect(() => {
    if (!destination) {
      setMinutes(null);
      setDelayed(false);
      return;
    }

    let cancelled = false;

    async function tick() {
      const pos = busPosRef.current;
      if (!pos) return;
      const [trafficSeconds, freeFlowSeconds] = await Promise.all([
        mapboxTrafficDurationSeconds(pos, destination!),
        osrmDurationSeconds("driving", pos, destination!),
      ]);
      if (cancelled) return;
      if (trafficSeconds == null) {
        setError(true);
        return;
      }
      setError(false);
      setMinutes(Math.round(trafficSeconds / 60));
      setDelayed(freeFlowSeconds != null && trafficSeconds - freeFlowSeconds > 120);
    }

    tick();
    const iv = setInterval(tick, TRAFFIC_ETA_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
    // destination is a fixed stage (lat/lng of a stop) so comparing its
    // coordinates is enough to know when to restart the loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination?.lat, destination?.lng]);

  return { minutes, delayed, error };
}
