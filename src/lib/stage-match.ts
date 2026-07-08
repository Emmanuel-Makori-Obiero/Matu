// The passenger's "from"/"to" text (e.g. "Roysambu") often isn't the exact name of a
// stage. This geocodes what they typed with Google Maps, then finds the nearest actual
// stage across ALL routes (using straight-line/haversine distance), so we can say
// "closest stop: Roysambu is served by CBD <-> Kasarani, alight at Roasters" instead of
// finding nothing.

import { loadGoogleMaps } from "@/lib/google-maps";
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
  const google = await loadGoogleMaps();
  const geocoder = new google.maps.Geocoder();
  const result = await new Promise<google.maps.GeocoderResult | null>((resolve) => {
    geocoder.geocode({ address: `${query}, Nairobi, Kenya` }, (results, status) => {
      resolve(status === "OK" && results?.[0] ? results[0] : null);
    });
  });
  if (!result) return [];

  const lat = result.geometry.location.lat();
  const lng = result.geometry.location.lng();

  return (stages as StageRow[])
    .map((stage) => ({
      stage,
      distanceKm: haversineKm(lat, lng, stage.lat, stage.lng),
      exactNameMatch: false,
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);
}
