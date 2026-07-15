import { useEffect, useRef, useState } from "react";
import { Search, Loader2 } from "lucide-react";

// Nominatim (used elsewhere for passenger "nearest stage" lookups) is
// OSM-only, which is patchy for named businesses/buildings in Nairobi
// (things like "GoMyCode" or a specific plaza may not be tagged in OSM at
// all). Mapbox's Geocoding API indexes POIs and addresses far more
// completely and we already pay for/use Mapbox elsewhere (traffic ETA), so
// this uses that instead — proximity-biased to Nairobi so results for
// ambiguous names favor the local match.

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
const NAIROBI_PROXIMITY = "36.8219,-1.2921"; // lng,lat — biases ambiguous queries local

export type PlaceResult = {
  id: string;
  name: string;
  fullAddress: string;
  lat: number;
  lng: number;
};

// Nairobi bounding box (roughly the metro area) — a hard bbox pulls Mapbox's
// ranking toward genuinely local POIs far more than proximity bias alone,
// which only nudges ambiguous matches and still lets far-away/admin-level
// results ("Nairobi County", a whole town) outrank a real nearby building.
const NAIROBI_BBOX = "36.65,-1.45,37.05,-1.10"; // minLng,minLat,maxLng,maxLat

async function searchMapbox(query: string): Promise<PlaceResult[]> {
  if (!MAPBOX_TOKEN) return [];
  try {
    const url =
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json` +
      `?access_token=${MAPBOX_TOKEN}&proximity=${NAIROBI_PROXIMITY}&bbox=${NAIROBI_BBOX}` +
      `&country=ke&limit=8&autocomplete=true&fuzzyMatch=true` +
      // poi/poi.landmark = businesses/buildings/landmarks, address = street
      // addresses — these are what actually matter for "where is Platinum
      // Plaza" style queries; place/neighborhood are kept only as a last resort.
      `&types=poi,poi.landmark,address,neighborhood,place`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = (await res.json()) as {
      features?: Array<{
        id: string;
        text: string;
        place_name: string;
        center: [number, number];
        place_type?: string[];
      }>;
    };
    return (data.features ?? []).map((f) => ({
      id: f.id,
      name: f.text,
      fullAddress: f.place_name,
      lng: f.center[0],
      lat: f.center[1],
    }));
  } catch {
    return [];
  }
}

// Nominatim (OSM) — no key, no billing. Mapbox's POI coverage is usually
// better in Nairobi, but not always complete, so this fills gaps (a specific
// tower/plaza Mapbox has no POI entry for) rather than leaving the dropdown
// showing only broad place/neighborhood matches.
async function searchNominatim(query: string): Promise<PlaceResult[]> {
  try {
    const url =
      `https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=ke` +
      `&viewbox=${NAIROBI_BBOX}&bounded=1&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return [];
    const data = (await res.json()) as Array<{
      place_id: number;
      display_name: string;
      lat: string;
      lon: string;
      name?: string;
    }>;
    return data.map((r) => ({
      id: `osm-${r.place_id}`,
      name: r.name || r.display_name.split(",")[0],
      fullAddress: r.display_name,
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
    }));
  } catch {
    return [];
  }
}

async function searchPlaces(query: string): Promise<PlaceResult[]> {
  if (query.trim().length < 2) return [];
  const [mapbox, nominatim] = await Promise.all([searchMapbox(query), searchNominatim(query)]);
  // Mapbox first (usually better-ranked/named), then any Nominatim results
  // whose coordinates aren't basically the same point already returned.
  const merged = [...mapbox];
  for (const n of nominatim) {
    const dupe = merged.some(
      (m) => Math.abs(m.lat - n.lat) < 0.0005 && Math.abs(m.lng - n.lng) < 0.0005,
    );
    if (!dupe) merged.push(n);
  }
  return merged.slice(0, 8);
}

export function PlaceSearch({
  placeholder = "Search a place, building, or business…",
  onSelect,
  className,
}: {
  placeholder?: string;
  onSelect: (place: PlaceResult) => void;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    // 350ms debounce — Mapbox's free/pay-as-you-go geocoding tier bills per
    // request, so this avoids firing one for every keystroke.
    debounceRef.current = setTimeout(async () => {
      const places = await searchPlaces(query);
      setResults(places);
      setLoading(false);
      setOpen(true);
    }, 350);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      <div className="flex items-center gap-2 rounded-md border border-input bg-surface px-3 py-1.5">
        {loading ? (
          <Loader2 className="size-4 shrink-0 animate-spin opacity-60" />
        ) : (
          <Search className="size-4 shrink-0 opacity-60" />
        )}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
      </div>

      {open && results.length > 0 && (
        <ul className="absolute z-[1000] mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-surface shadow-lg">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(r);
                  setQuery(r.name);
                  setOpen(false);
                }}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-secondary"
              >
                <span className="font-medium">{r.name}</span>
                <span className="block truncate text-xs opacity-60">{r.fullAddress}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
