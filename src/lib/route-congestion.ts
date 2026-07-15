// FILE: src/lib/route-congestion.ts
// Fetches the actual road-snapped path from a driver's current position to a
// destination, annotated with Mapbox's per-segment traffic congestion level
// (low/moderate/heavy/severe) — this is what lets the driver map show a
// route line that's red *only where the jam actually is*, rather than one
// flat color for the whole leg.
import type { LatLng } from "./traffic-eta";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

export type CongestionLevel = "unknown" | "low" | "moderate" | "heavy" | "severe";

export type CongestionSegment = {
  // Exactly two points — one line segment of the route, colored by how
  // congested that specific stretch of road is right now.
  coords: [LatLng, LatLng];
  level: CongestionLevel;
};

// Kept as a function (not a constant) so it's trivial to adjust per level
// without hunting through RouteMap for the color logic.
export function congestionColor(level: CongestionLevel): string {
  switch (level) {
    case "severe":
      return "#991b1b"; // dark red — standstill
    case "heavy":
      return "#dc2626"; // red — the "jam" color the driver-side red line refers to
    case "moderate":
      return "#f59e0b"; // amber — slower than free-flow but moving
    case "low":
      return "#0a5f3d"; // Matu green — free-flowing, matches the normal route color
    default:
      return "#6b7280"; // gray — Mapbox didn't return a reading for this stretch
  }
}

export async function fetchCongestionRoute(
  origin: LatLng,
  destination: LatLng,
): Promise<CongestionSegment[] | null> {
  if (!MAPBOX_TOKEN) {
    console.error(
      "[route-congestion] VITE_MAPBOX_TOKEN is missing — set it in your environment/Vercel project settings.",
    );
    return null;
  }
  try {
    const url =
      `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/` +
      `${origin.lng},${origin.lat};${destination.lng},${destination.lat}` +
      `?geometries=geojson&overview=full&annotations=congestion&access_token=${MAPBOX_TOKEN}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[route-congestion] Mapbox Directions request failed: ${res.status}`);
      return null;
    }
    const data = (await res.json()) as {
      routes?: Array<{
        geometry: { coordinates: [number, number][] }; // [lng, lat] pairs
        legs: Array<{ annotation?: { congestion?: string[] } }>;
      }>;
    };
    const route = data.routes?.[0];
    if (!route) return null;

    const coords = route.geometry.coordinates;
    // congestion[i] describes the road between coords[i] and coords[i+1] —
    // Mapbox returns one fewer congestion reading than coordinate points.
    const congestion = route.legs.flatMap((leg) => leg.annotation?.congestion ?? []);

    const segments: CongestionSegment[] = [];
    for (let i = 0; i < coords.length - 1; i++) {
      const [lng1, lat1] = coords[i];
      const [lng2, lat2] = coords[i + 1];
      const level = (congestion[i] as CongestionLevel) ?? "unknown";
      segments.push({
        coords: [
          { lat: lat1, lng: lng1 },
          { lat: lat2, lng: lng2 },
        ],
        level,
      });
    }
    return segments;
  } catch (err) {
    console.error("[route-congestion] request threw:", err);
    return null;
  }
}
