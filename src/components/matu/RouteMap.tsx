import { useEffect, useRef, useState } from "react";
import { L, NAIROBI_CENTER } from "@/lib/leaflet-map";

export type MapStage = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  passengerCount?: number;
};
export type MapVehicle = {
  id: string;
  lat: number;
  lng: number;
  heading?: number | null;
  label?: string;
};

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

// Refresh the road-snapped route on an interval rather than on every GPS tick
// (the vehicle broadcasts its position every ~5s) — the route shape barely
// changes between ticks, and this keeps Mapbox API usage sane. The route line
// is still visually "live": the origin end reads from a ref that's updated on
// every tick, so once redrawn it always starts from the vehicle's latest spot.
const LIVE_ROUTE_REFRESH_MS = 10_000;

// Fetches the actual road path (not a straight line) between two points, the
// same way Google Directions / Uber draw the "remaining route" line that
// shrinks and reshapes as the vehicle drives. Returns Leaflet-ordered
// [lat, lng] pairs, or null if the token is missing or the request fails.
async function fetchRoadRoute(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
): Promise<[number, number][] | null> {
  if (!MAPBOX_TOKEN) {
    console.error(
      "[RouteMap] VITE_MAPBOX_TOKEN is missing. Set it in your environment/Vercel project settings.",
    );
    return null;
  }
  try {
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[RouteMap] Mapbox request failed: ${res.status} ${res.statusText}`);
      return null;
    }
    const data = (await res.json()) as {
      routes?: Array<{ geometry?: { coordinates?: [number, number][] } }>;
    };
    const coords = data.routes?.[0]?.geometry?.coordinates;
    if (!coords) {
      console.error("[RouteMap] Mapbox response had no route geometry:", data);
      return null;
    }
    return coords.map(([lng, lat]) => [lat, lng] as [number, number]);
  } catch (err) {
    console.error("[RouteMap] Mapbox request threw:", err);
    return null;
  }
}

// Directional wedge icon (rotates to face travel direction) — mirrors the old
// Google FORWARD_CLOSED_ARROW look using a rotated div + CSS triangle.
function vehicleDivIcon(hasHeading: boolean, heading: number | null | undefined) {
  const html = hasHeading
    ? `<div style="
        width:0;height:0;
        border-left:7px solid transparent;
        border-right:7px solid transparent;
        border-bottom:16px solid #f4c430;
        filter:drop-shadow(0 0 1px #0a5f3d) drop-shadow(0 0 1px #0a5f3d);
        transform:rotate(${heading}deg);
        transform-origin:center;
      "></div>`
    : `<div style="
        width:18px;height:18px;border-radius:50%;
        background:#f4c430;border:2px solid #0a5f3d;
      "></div>`;
  return L.divIcon({ html, className: "", iconSize: [18, 18], iconAnchor: [9, 9] });
}

function pinDivIcon() {
  const html = `<div style="
    width:16px;height:16px;border-radius:50%;
    background:#e11d48;border:2px solid #ffffff;
    box-shadow:0 0 0 1px rgba(0,0,0,0.15);
  "></div>`;
  return L.divIcon({ html, className: "", iconSize: [16, 16], iconAnchor: [8, 8] });
}

function stageDivIcon(passengerCount?: number) {
  // Badge only appears when there's actually demand at this stage — a driver
  // scanning the map at a glance should be able to tell "3 people waiting
  // here" apart from an empty stop without reading every label.
  const badge =
    passengerCount && passengerCount > 0
      ? `<div style="
          position:absolute;top:-8px;right:-8px;min-width:16px;height:16px;
          border-radius:8px;background:#e11d48;color:#fff;font-size:10px;
          font-weight:700;display:flex;align-items:center;justify-content:center;
          padding:0 3px;border:1.5px solid #fff;
        ">${passengerCount > 9 ? "9+" : passengerCount}</div>`
      : "";
  const html = `<div style="position:relative;width:14px;height:14px;">
    <div style="
      width:14px;height:14px;border-radius:50%;
      background:#0a5f3d;
      border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,0.15);
    "></div>
    ${badge}
  </div>`;
  return L.divIcon({ html, className: "", iconSize: [14, 14], iconAnchor: [7, 7] });
}

export function RouteMap({
  stages,
  vehicles = [],
  pin = null,
  liveRoute = null,
  etaLabelByVehicleId,
  onMapClick,
  showTraffic = false,
  className,
}: {
  stages: MapStage[];
  vehicles?: MapVehicle[];
  pin?: { lat: number; lng: number } | null;
  // The road-snapped "remaining route" line from a live vehicle to a stage —
  // pass the passenger's booked trip + their pickup/dropoff stage to get the
  // Google-Directions/Uber style blue route line that follows actual roads.
  liveRoute?: {
    origin: { lat: number; lng: number };
    destination: { lat: number; lng: number };
  } | null;
  // Optional "Arriving in X min" text shown as a floating label above a
  // vehicle's marker, keyed by vehicle id — same idea as Uber's live trip map.
  etaLabelByVehicleId?: Record<string, string>;
  onMapClick?: (lat: number, lng: number) => void;
  // Overlays Mapbox's live traffic raster tiles (color-coded by congestion:
  // green free-flowing, orange moderate, red/dark-red heavy). Off by default
  // since it's an extra tile layer/network cost — opt in per screen (e.g. the
  // driver's trip map) rather than loading it everywhere.
  showTraffic?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const stageMarkers = useRef<L.Marker[]>([]);
  const polylineRef = useRef<L.Polyline | null>(null);
  const vehicleMarkers = useRef<Record<string, L.Marker>>({});
  const pinMarker = useRef<L.Marker | null>(null);
  const liveRoutePolylineRef = useRef<L.Polyline | null>(null);
  const trafficLayerRef = useRef<L.TileLayer | null>(null);
  const liveRouteOriginRef = useRef(liveRoute?.origin);
  liveRouteOriginRef.current = liveRoute?.origin;
  const [ready, setReady] = useState(false);

  // Init map once.
  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const first = stages[0];
    const center = first ? { lat: first.lat, lng: first.lng } : NAIROBI_CENTER;
    const map = L.map(ref.current, { zoomControl: true }).setView([center.lat, center.lng], 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    setReady(true);
    if (onMapClick) {
      map.on("click", (e: L.LeafletMouseEvent) => onMapClick(e.latlng.lat, e.latlng.lng));
    }
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live traffic overlay — Mapbox's traffic-day-v2 style tiles, color-coded
  // by current congestion. Added/removed as a separate tile layer rather than
  // baked into the base map so it can be toggled without recreating the map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

    if (!showTraffic || !token) {
      trafficLayerRef.current?.remove();
      trafficLayerRef.current = null;
      return;
    }
    if (!trafficLayerRef.current) {
      trafficLayerRef.current = L.tileLayer(
        `https://api.mapbox.com/styles/v1/mapbox/traffic-day-v2/tiles/{z}/{x}/{y}?access_token=${token}`,
        { maxZoom: 19, opacity: 0.75 },
      ).addTo(map);
    }
    return () => {
      trafficLayerRef.current?.remove();
      trafficLayerRef.current = null;
    };
  }, [showTraffic, ready]);

  // Draw stages + polyline
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    stageMarkers.current.forEach((m) => m.remove());
    stageMarkers.current = stages.map((s) =>
      L.marker([s.lat, s.lng], {
        icon: stageDivIcon(s.passengerCount),
        title: s.passengerCount ? `${s.name} — ${s.passengerCount} waiting` : s.name,
      }).addTo(map),
    );
    polylineRef.current?.remove();
    polylineRef.current = null;
    if (stages.length > 1) {
      const path = stages.map((s) => [s.lat, s.lng] as [number, number]);
      polylineRef.current = L.polyline(path, { color: "#0a5f3d", opacity: 0.9, weight: 3 }).addTo(
        map,
      );
      map.fitBounds(L.latLngBounds(path), { padding: [40, 40] });
    }
  }, [stages, ready]);

  // Live vehicles
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const seen = new Set<string>();
    vehicles.forEach((v) => {
      seen.add(v.id);
      const hasHeading = v.heading != null && !Number.isNaN(v.heading);
      const icon = vehicleDivIcon(hasHeading, v.heading);
      const label = etaLabelByVehicleId?.[v.id];
      const existing = vehicleMarkers.current[v.id];
      if (existing) {
        existing.setLatLng([v.lat, v.lng]);
        existing.setIcon(icon);
      } else {
        vehicleMarkers.current[v.id] = L.marker([v.lat, v.lng], {
          icon,
          title: v.label ?? "Matatu",
        }).addTo(map);
      }
      const marker = vehicleMarkers.current[v.id];
      if (label) {
        // updateContent works whether or not a tooltip is already bound, so this
        // stays cheap even though the label text changes every few seconds.
        if (marker.getTooltip()) {
          marker.setTooltipContent(label);
        } else {
          marker.bindTooltip(label, {
            permanent: true,
            direction: "top",
            offset: [0, -10],
            className: "matu-eta-tooltip",
          });
        }
      } else if (marker.getTooltip()) {
        marker.unbindTooltip();
      }
    });
    Object.keys(vehicleMarkers.current).forEach((id) => {
      if (!seen.has(id)) {
        vehicleMarkers.current[id].remove();
        delete vehicleMarkers.current[id];
      }
    });
  }, [vehicles, ready, etaLabelByVehicleId]);

  // Dropped pin — where the passenger tapped to set pickup/destination.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    if (!pin) {
      pinMarker.current?.remove();
      pinMarker.current = null;
      return;
    }

    if (pinMarker.current) {
      pinMarker.current.setLatLng([pin.lat, pin.lng]);
    } else {
      pinMarker.current = L.marker([pin.lat, pin.lng], {
        icon: pinDivIcon(),
        title: "Selected location",
        zIndexOffset: 999,
      }).addTo(map);
    }
    map.panTo([pin.lat, pin.lng]);
  }, [pin, ready]);

  // Live remaining-route line: the road-snapped path from the vehicle's current
  // position to the passenger's stage, redrawn periodically so it visually
  // shortens/reshapes as the vehicle drives — same idea as Google Directions or
  // Uber's live trip map, minus per-second updates (we don't need that granularity
  // and it would burn through the Mapbox free tier fast).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    if (!liveRoute) {
      liveRoutePolylineRef.current?.remove();
      liveRoutePolylineRef.current = null;
      return;
    }

    let cancelled = false;
    const destination = liveRoute.destination;
    const mapInstance = map;

    async function draw() {
      const origin = liveRouteOriginRef.current;
      if (!origin) return;
      const coords = await fetchRoadRoute(origin, destination);
      if (cancelled || !coords) return;
      liveRoutePolylineRef.current?.remove();
      liveRoutePolylineRef.current = L.polyline(coords, {
        color: "#1a73e8",
        weight: 5,
        opacity: 0.85,
        lineCap: "round",
        lineJoin: "round",
      }).addTo(mapInstance);
    }

    draw();
    const iv = setInterval(draw, LIVE_ROUTE_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(iv);
      liveRoutePolylineRef.current?.remove();
      liveRoutePolylineRef.current = null;
    };
    // Only the destination (a fixed stage) and readiness restart the fetch loop —
    // the origin moves every GPS tick and is read live from a ref inside draw()
    // instead, so this doesn't refetch on every single position update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveRoute?.destination.lat, liveRoute?.destination.lng, ready]);

  return (
    <div ref={ref} className={className ?? "h-[420px] w-full rounded-2xl border border-border"} />
  );
}
