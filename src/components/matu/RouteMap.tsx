import { useEffect, useRef, useState } from "react";
import { L, NAIROBI_CENTER } from "@/lib/leaflet-map";
import { congestionColor, type CongestionSegment } from "@/lib/route-congestion";

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
// A single waiting passenger, positioned near their pickup stage (bookings
// only store a pickup_stage_id, not a live per-passenger GPS fix, so callers
// should jitter multiple passengers at the same stage into a small cluster
// rather than stacking them on one exact point — see jitterAroundStage in
// drive.trip.tsx).
export type MapPassenger = {
  id: string;
  lat: number;
  lng: number;
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

// The passenger's own live GPS position on their tracking screen — deliberately
// red and a plain dot (not the yellow directional wedge used for the vehicle),
// so "which dot is me" vs "which dot is the matatu" is unambiguous at a glance.
// Slightly bigger than the purple waiting-passenger dots too, since this one
// represents "you" specifically rather than generic demand at a stage.
function selfDivIcon() {
  const html = `<div style="
    width:16px;height:16px;border-radius:50%;
    background:#dc2626;border:3px solid #ffffff;
    box-shadow:0 0 6px rgba(220,38,38,0.6);
  "></div>`;
  return L.divIcon({ html, className: "", iconSize: [16, 16], iconAnchor: [8, 8] });
}

// Small purple dot for a single waiting passenger — deliberately smaller and
// a different color than the stage marker (green) and vehicle marker (yellow)
// so a driver scanning the map can tell "person" apart from "stop" apart from
// "matatu" at a glance.
function passengerDivIcon() {
  const html = `<div style="
    width:9px;height:9px;border-radius:50%;
    background:#7c3aed;border:1.5px solid #ffffff;
    box-shadow:0 0 0 1px rgba(0,0,0,0.15);
  "></div>`;
  return L.divIcon({ html, className: "", iconSize: [9, 9], iconAnchor: [5, 5] });
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
  passengers = [],
  pin = null,
  liveRoute = null,
  etaLabelByVehicleId,
  onMapClick,
  showTraffic = false,
  jammed = false,
  congestionRoute,
  tracePath = null,
  selfPosition = null,
  onLiveRouteStaleChange,
  className,
}: {
  stages: MapStage[];
  vehicles?: MapVehicle[];
  // Individual waiting-passenger dots — see MapPassenger for the caveat on
  // where their position comes from.
  passengers?: MapPassenger[];
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
  // When true, the main stages-to-stages polyline is drawn red instead of
  // green — the simple, whole-leg version of the jam signal. If
  // congestionRoute is also provided, that one is drawn on top and is the
  // more accurate signal (red only on the actually-jammed stretch); this flag
  // is kept as the fallback for screens/renders that don't have a live
  // congestion fetch yet.
  jammed?: boolean;
  // The actual road-snapped path from the driver's current position to their
  // chosen destination, colored per-segment by real-time congestion (see
  // src/lib/route-congestion.ts) — green where traffic is flowing, amber for
  // moderate, red/dark-red for a genuine jam on that specific stretch of
  // road. This is what "the route should be red at the part there is a jam"
  // means literally: only the jammed segments are red, not the whole line.
  congestionRoute?: CongestionSegment[] | null;
  // The driver's own recorded GPS trail — either being drawn live as they
  // drive ("Draw route" mode, growing point-by-point on every GPS tick) or
  // the last trail previously saved for this route. Drawn as a dashed blue
  // line so it's visually distinct from the plain stage-to-stage line and
  // the Mapbox-derived congestion line, since this one is "ground truth"
  // traced by an actual vehicle rather than fetched from a map that may be
  // outdated for this area.
  tracePath?: [number, number][] | null;
  // The viewer's own live GPS position — used on the passenger tracking
  // screen so a passenger can see themselves (red dot) alongside the
  // vehicle (yellow) and the route/remaining-route line, without needing to
  // press anything first. Not used on the driver's own map, since the
  // vehicle marker already *is* the driver's position there.
  selfPosition?: { lat: number; lng: number } | null;
  // Called once when the live route fails to refresh twice in a row (not on
  // a single blip) — lets the screen tell the user "this route/ETA may be
  // outdated" instead of silently drawing a stale line with no signal that
  // anything's wrong. Called again with `false` once a refresh succeeds.
  onLiveRouteStaleChange?: (stale: boolean) => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const stageMarkers = useRef<L.Marker[]>([]);
  const polylineRef = useRef<L.Polyline | null>(null);
  const congestionLayerRef = useRef<L.LayerGroup | null>(null);
  const tracePolylineRef = useRef<L.Polyline | null>(null);
  const vehicleMarkers = useRef<Record<string, L.Marker>>({});
  const passengerMarkers = useRef<Record<string, L.Marker>>({});
  const pinMarker = useRef<L.Marker | null>(null);
  const selfMarker = useRef<L.Marker | null>(null);
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
      polylineRef.current = L.polyline(path, {
        color: jammed ? "#dc2626" : "#0a5f3d",
        opacity: 0.9,
        weight: jammed ? 5 : 3,
      }).addTo(map);
      map.fitBounds(L.latLngBounds(path), { padding: [40, 40] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stages, ready]);

  // Re-colors the existing polyline in place when the jam state flips, instead
  // of rebuilding it via the effect above — that one also re-fits map bounds,
  // which would yank the driver's view/zoom every time traffic clears or
  // returns, purely as a side effect of a color change.
  useEffect(() => {
    polylineRef.current?.setStyle({
      color: jammed ? "#dc2626" : "#0a5f3d",
      weight: jammed ? 5 : 3,
    });
  }, [jammed]);

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

  // Waiting-passenger dots — same add/update/remove-stale pattern as vehicles
  // above, keyed by booking id so a dot moves rather than flickers if a
  // passenger's jittered position is recomputed between renders.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const seen = new Set<string>();
    passengers.forEach((p) => {
      seen.add(p.id);
      const existing = passengerMarkers.current[p.id];
      if (existing) {
        existing.setLatLng([p.lat, p.lng]);
      } else {
        passengerMarkers.current[p.id] = L.marker([p.lat, p.lng], {
          icon: passengerDivIcon(),
          title: p.label ?? "Waiting passenger",
          zIndexOffset: -100, // sits below stage/vehicle markers, not on top
        }).addTo(map);
      }
    });
    Object.keys(passengerMarkers.current).forEach((id) => {
      if (!seen.has(id)) {
        passengerMarkers.current[id].remove();
        delete passengerMarkers.current[id];
      }
    });
  }, [passengers, ready]);

  // The viewer's own live position — a single marker, moved in place on
  // every update rather than removed/re-added, so it doesn't flicker each
  // time a GPS fix comes in every few seconds.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (!selfPosition) {
      selfMarker.current?.remove();
      selfMarker.current = null;
      return;
    }
    if (selfMarker.current) {
      selfMarker.current.setLatLng([selfPosition.lat, selfPosition.lng]);
    } else {
      selfMarker.current = L.marker([selfPosition.lat, selfPosition.lng], {
        icon: selfDivIcon(),
        title: "You",
        zIndexOffset: 200, // always visible on top of stage/vehicle/passenger markers
      }).addTo(map);
    }
  }, [selfPosition, ready]);

  // The road-snapped, per-segment jam-colored route — drawn as its own layer
  // group so it can sit on top of the plain green/red stages polyline without
  // fighting it for the same L.Polyline instance. Rebuilt whenever the
  // segments change (i.e. on each periodic congestion refetch), not diffed
  // segment-by-segment — a full route redraw every ~15s is cheap compared to
  // the network fetch that produced it.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    congestionLayerRef.current?.remove();
    congestionLayerRef.current = null;
    if (congestionRoute && congestionRoute.length > 0) {
      const group = L.layerGroup();
      for (const seg of congestionRoute) {
        L.polyline(
          [
            [seg.coords[0].lat, seg.coords[0].lng],
            [seg.coords[1].lat, seg.coords[1].lng],
          ],
          { color: congestionColor(seg.level), weight: 5, opacity: 0.95 },
        ).addTo(group);
      }
      group.addTo(map);
      congestionLayerRef.current = group;
    }
  }, [congestionRoute, ready]);

  // The driver-traced route — rebuilt whenever the point array grows (i.e. on
  // every accepted GPS tick while recording) or when a previously-saved trail
  // is passed in for display. A full-line redraw per tick is cheap (it's just
  // a polyline of a few hundred points at most) and keeps this in its own
  // layer so it never fights the stages polyline or congestion overlay for
  // the same instance. Deliberately does NOT call fitBounds — recording can
  // run for a long trip and shouldn't keep yanking the driver's zoom/pan.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    tracePolylineRef.current?.remove();
    tracePolylineRef.current = null;
    if (tracePath && tracePath.length > 1) {
      tracePolylineRef.current = L.polyline(tracePath, {
        color: "#1a73e8",
        weight: 4,
        opacity: 0.9,
        dashArray: "1,8",
        lineCap: "round",
      }).addTo(map);
    }
  }, [tracePath, ready]);

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
    let consecutiveFailures = 0;

    async function draw() {
      const origin = liveRouteOriginRef.current;
      if (!origin) return;
      const coords = await fetchRoadRoute(origin, destination);
      if (cancelled) return;
      if (!coords) {
        // Don't touch the existing line -- an old, road-snapped route is
        // still more useful than none -- but do tell the caller so the
        // screen can show "may be outdated" instead of staying silent about
        // a route that's now failed to refresh twice in a row.
        consecutiveFailures += 1;
        if (consecutiveFailures === 2) onLiveRouteStaleChange?.(true);
        return;
      }
      if (consecutiveFailures >= 2) onLiveRouteStaleChange?.(false);
      consecutiveFailures = 0;
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
