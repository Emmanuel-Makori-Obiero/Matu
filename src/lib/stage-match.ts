// The passenger's "from"/"to" text (e.g. "Roysambu") often isn't the exact name of a
// stage. This geocodes what they typed with Nominatim (OpenStreetMap's free geocoder,
// no key/billing), then finds the nearest actual stage across ALL routes (using
// straight-line/haversine distance), so we can say "closest stop: Roysambu is served by
// CBD <-> Kasarani, alight at Roasters" instead of finding nothing.

import { supabase } from "@/integrations/supabase/client";

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

// Nominatim (OpenStreetMap's free geocoder) — no key, no billing. Their usage policy
// asks for at most ~1 req/sec and a descriptive User-Agent/Referer, which the browser
// sets automatically; keep this to on-demand lookups (not polling) to stay within it.
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
  const geocoded = await geocodeWithNominatim(`${query}, Nairobi, Kenya`);
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
