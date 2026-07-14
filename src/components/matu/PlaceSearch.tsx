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

async function searchPlaces(query: string): Promise<PlaceResult[]> {
  if (!MAPBOX_TOKEN || query.trim().length < 2) return [];
  try {
    const url =
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json` +
      `?access_token=${MAPBOX_TOKEN}&proximity=${NAIROBI_PROXIMITY}&country=ke&limit=6` +
      // poi = businesses/buildings/landmarks, address = street addresses — the two
      // types that actually matter for "where is Platinum Plaza" style queries.
      `&types=poi,address,place,neighborhood`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = (await res.json()) as {
      features?: Array<{ id: string; text: string; place_name: string; center: [number, number] }>;
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

  if (!MAPBOX_TOKEN) return null; // silently degrade — tap-the-map still works

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
