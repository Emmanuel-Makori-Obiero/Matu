import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps, NAIROBI_CENTER } from "@/lib/google-maps";

export type MapStage = { id: string; name: string; lat: number; lng: number };
export type MapVehicle = {
  id: string;
  lat: number;
  lng: number;
  heading?: number | null;
  label?: string;
};

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
  const mapRef = useRef<google.maps.Map | null>(null);
  const stageMarkers = useRef<google.maps.Marker[]>([]);
  const vehicleMarkers = useRef<Record<string, google.maps.Marker>>({});
  const pinMarker = useRef<google.maps.Marker | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps().then((g) => {
      if (cancelled || !ref.current) return;
      const first = stages[0];
      const map = new g.maps.Map(ref.current, {
        center: first ? { lat: first.lat, lng: first.lng } : NAIROBI_CENTER,
        zoom: 12,
        disableDefaultUI: true,
        zoomControl: true,
      });
      mapRef.current = map;
      setReady(true);
      if (onMapClick) {
        map.addListener("click", (e: google.maps.MapMouseEvent) => {
          if (e.latLng) onMapClick(e.latLng.lat(), e.latLng.lng());
        });
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Draw stages + polyline
  useEffect(() => {
    const map = mapRef.current;
    const windowWithGoogle = window as Window & { google?: typeof google };
    if (!map || !ready || !windowWithGoogle.google) return;
    const g = windowWithGoogle.google;
    stageMarkers.current.forEach((m) => m.setMap(null));
    stageMarkers.current = stages.map(
      (s, i) =>
        new g.maps.Marker({
          position: { lat: s.lat, lng: s.lng },
          map,
          label: { text: String(i + 1), color: "#fff", fontSize: "11px" },
          title: s.name,
        }),
    );
    if (stages.length > 1) {
      new g.maps.Polyline({
        path: stages.map((s) => ({ lat: s.lat, lng: s.lng })),
        strokeColor: "#0a5f3d",
        strokeOpacity: 0.9,
        strokeWeight: 3,
        map,
      });
      const bounds = new g.maps.LatLngBounds();
      stages.forEach((s) => bounds.extend({ lat: s.lat, lng: s.lng }));
      map.fitBounds(bounds, 40);
    }
  }, [stages, ready]);

  // Live vehicles
  useEffect(() => {
    const map = mapRef.current;
    const windowWithGoogle = window as Window & { google?: typeof google };
    if (!map || !ready || !windowWithGoogle.google) return;
    const g = windowWithGoogle.google;
    const seen = new Set<string>();
    vehicles.forEach((v) => {
      seen.add(v.id);
      const hasHeading = v.heading != null && !Number.isNaN(v.heading);
      const icon = hasHeading
        ? {
            // Directional wedge, like Bolt/Uber — rotates to face travel direction.
            path: g.maps.SymbolPath.FORWARD_CLOSED_ARROW,
            scale: 6,
            rotation: v.heading as number,
            fillColor: "#f4c430",
            fillOpacity: 1,
            strokeColor: "#0a5f3d",
            strokeWeight: 2,
          }
        : {
            // No heading yet (vehicle stationary / no compass) — plain dot.
            path: g.maps.SymbolPath.CIRCLE,
            scale: 9,
            fillColor: "#f4c430",
            fillOpacity: 1,
            strokeColor: "#0a5f3d",
            strokeWeight: 2,
          };
      const existing = vehicleMarkers.current[v.id];
      if (existing) {
        existing.setPosition({ lat: v.lat, lng: v.lng });
        existing.setIcon(icon);
      } else {
        vehicleMarkers.current[v.id] = new g.maps.Marker({
          position: { lat: v.lat, lng: v.lng },
          map,
          title: v.label ?? "Matatu",
          icon,
        });
      }
    });
    // Remove stale
    Object.keys(vehicleMarkers.current).forEach((id) => {
      if (!seen.has(id)) {
        vehicleMarkers.current[id].setMap(null);
        delete vehicleMarkers.current[id];
      }
    });
  }, [vehicles, ready]);

  // Dropped pin — where the passenger tapped to set pickup/destination.
  useEffect(() => {
    const map = mapRef.current;
    const windowWithGoogle = window as Window & { google?: typeof google };
    if (!map || !ready || !windowWithGoogle.google) return;
    const g = windowWithGoogle.google;

    if (!pin) {
      pinMarker.current?.setMap(null);
      pinMarker.current = null;
      return;
    }

    const icon = {
      path: g.maps.SymbolPath.CIRCLE,
      scale: 8,
      fillColor: "#e11d48",
      fillOpacity: 1,
      strokeColor: "#ffffff",
      strokeWeight: 2,
    };

    if (pinMarker.current) {
      pinMarker.current.setPosition({ lat: pin.lat, lng: pin.lng });
    } else {
      pinMarker.current = new g.maps.Marker({
        position: { lat: pin.lat, lng: pin.lng },
        map,
        icon,
        title: "Selected location",
        zIndex: 999,
      });
    }
    map.panTo({ lat: pin.lat, lng: pin.lng });
  }, [pin, ready]);

  return (
    <div ref={ref} className={className ?? "h-[420px] w-full rounded-2xl border border-border"} />
  );
}
