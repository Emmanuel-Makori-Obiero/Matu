// The passenger's "from"/"to" text (e.g. "Roysambu" or "GoMyCode") often isn't the
// exact name of a stage. This geocodes what they typed with Mapbox (POI/business
// coverage is much better than OSM/Nominatim for named places like a specific
// building or business — the whole point of this lookup), then finds the nearest
// actual stage across ALL routes (using straight-line/haversine distance), so we
// can say "closest stop: Roysambu is served by CBD <-> Kasarani, alight at
// Roasters" instead of finding nothing.

import { supabase } from "@/integrations/supabase/client";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
const NAIROBI_PROXIMITY = "36.8219,-1.2921"; // lng,lat

type StageRow = { id: string; route_id: string; name: string; lat: number; lng: number };

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export type NearestStageResult = {
  stage: StageRow;
  distanceKm: number;
  exactNameMatch: boolean;
};

// Nominatim (OpenStreetMap's free geocoder) — no key, no billing. Kept as a
// fallback for when Mapbox has no token configured or returns nothing; Mapbox
// tends to win for named businesses/buildings, Nominatim occasionally has
// small local landmarks Mapbox lacks. Their usage policy asks for at most
// ~1 req/sec and a descriptive User-Agent/Referer, which the browser sets
// automatically; keep this to on-demand lookups (not polling) to stay within it.
async function geocodeWithNominatim(query: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const results = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (!results[0]) return null;
    return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) };
  } catch {
    return null;
  }
}

// Primary geocoder: Mapbox's POI index covers named businesses/buildings
// ("GoMyCode", "Platinum Plaza", "Westside Towers") far more completely than
// OSM/Nominatim does for Nairobi. Proximity-biased so ambiguous names favor
// the local match.
async function geocodeWithMapbox(query: string): Promise<{ lat: number; lng: number } | null> {
  if (!MAPBOX_TOKEN) return null;
  try {
    const url =
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json` +
      `?access_token=${MAPBOX_TOKEN}&proximity=${NAIROBI_PROXIMITY}&country=ke&limit=1` +
      `&types=poi,address,place,neighborhood`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as { features?: Array<{ center: [number, number] }> };
    const center = data.features?.[0]?.center;
    if (!center) return null;
    return { lat: center[1], lng: center[0] };
  } catch {
    return null;
  }
}

async function geocode(query: string): Promise<{ lat: number; lng: number } | null> {
  return (await geocodeWithMapbox(query)) ?? (await geocodeWithNominatim(query));
}

// Given raw coordinates (e.g. from a map click/tap), returns the closest stage(s) on
// file — no geocoding needed since we already have a lat/lng. Used by the "tap the map
// to set pickup/destination" flow.
export async function findNearestStageByCoords(
  lat: number,
  lng: number,
  limit = 3,
): Promise<NearestStageResult[]> {
  const { data: stages, error } = await supabase.from("stages").select("id,route_id,name,lat,lng");
  if (error || !stages || stages.length === 0) return [];

  return (stages as StageRow[])
    .map((stage) => ({
      stage,
      distanceKm: haversineKm(lat, lng, stage.lat, stage.lng),
      exactNameMatch: false,
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);
}

// Geocodes `query` (e.g. "Roysambu, Nairobi") then returns the closest stage on file,
// across every route, sorted nearest-first. Also flags an exact/partial name match so
// the UI can say "found" vs. "nearest alternative".
export async function findNearestStage(query: string, limit = 3): Promise<NearestStageResult[]> {
  const { data: stages, error } = await supabase.from("stages").select("id,route_id,name,lat,lng");
  if (error || !stages) return [];

  const lower = query.trim().toLowerCase();
  const nameMatches = (stages as StageRow[]).filter((s) => s.name.toLowerCase().includes(lower));
  if (nameMatches.length > 0) {
    return nameMatches
      .slice(0, limit)
      .map((stage) => ({ stage, distanceKm: 0, exactNameMatch: true }));
  }

  // No stage literally named that — geocode it and find the nearest real stage.
  const geocoded = await geocode(`${query}, Nairobi, Kenya`);
  if (!geocoded) return [];

  const { lat, lng } = geocoded;

  return (stages as StageRow[])
    .map((stage) => ({
      stage,
      distanceKm: haversineKm(lat, lng, stage.lat, stage.lng),
      exactNameMatch: false,
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);
}
