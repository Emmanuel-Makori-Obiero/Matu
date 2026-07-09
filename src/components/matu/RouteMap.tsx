import { useEffect, useRef, useState } from "react";
import { L, NAIROBI_CENTER } from "@/lib/leaflet-map";

export type MapStage = { id: string; name: string; lat: number; lng: number };
export type MapVehicle = {
  id: string;
  lat: number;
  lng: number;
  heading?: number | null;
  label?: string;
};

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

function stageDivIcon(index: number) {
  const html = `<div style="
    width:22px;height:22px;border-radius:50%;
    background:#0a5f3d;color:#fff;font-size:11px;font-weight:600;
    display:flex;align-items:center;justify-content:center;
    border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,0.15);
  ">${index + 1}</div>`;
  return L.divIcon({ html, className: "", iconSize: [22, 22], iconAnchor: [11, 11] });
}

export function RouteMap({
  stages,
  vehicles = [],
  pin = null,
  onMapClick,
  className,
}: {
  stages: MapStage[];
  vehicles?: MapVehicle[];
  pin?: { lat: number; lng: number } | null;
  onMapClick?: (lat: number, lng: number) => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const stageMarkers = useRef<L.Marker[]>([]);
  const polylineRef = useRef<L.Polyline | null>(null);
  const vehicleMarkers = useRef<Record<string, L.Marker>>({});
  const pinMarker = useRef<L.Marker | null>(null);
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

  // Draw stages + polyline
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    stageMarkers.current.forEach((m) => m.remove());
    stageMarkers.current = stages.map((s, i) =>
      L.marker([s.lat, s.lng], { icon: stageDivIcon(i), title: s.name }).addTo(map),
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
    });
    Object.keys(vehicleMarkers.current).forEach((id) => {
      if (!seen.has(id)) {
        vehicleMarkers.current[id].remove();
        delete vehicleMarkers.current[id];
      }
    });
  }, [vehicles, ready]);

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

  return (
    <div ref={ref} className={className ?? "h-[420px] w-full rounded-2xl border border-border"} />
  );
}
