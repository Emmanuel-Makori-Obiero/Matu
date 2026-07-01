import { useEffect, useRef } from "react";
import { loadGoogleMaps, NAIROBI_CENTER } from "@/lib/google-maps";

export type MapStage = { id: string; name: string; lat: number; lng: number };
export type MapVehicle = { id: string; lat: number; lng: number; label?: string };

export function RouteMap({
  stages,
  vehicles = [],
  onMapClick,
  className,
}: {
  stages: MapStage[];
  vehicles?: MapVehicle[];
  onMapClick?: (lat: number, lng: number) => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const stageMarkers = useRef<google.maps.Marker[]>([]);
  const vehicleMarkers = useRef<Record<string, google.maps.Marker>>({});

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
    if (!map || !(window as any).google) return;
    const g = (window as any).google as typeof google;
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
  }, [stages]);

  // Live vehicles
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !(window as any).google) return;
    const g = (window as any).google as typeof google;
    const seen = new Set<string>();
    vehicles.forEach((v) => {
      seen.add(v.id);
      const existing = vehicleMarkers.current[v.id];
      if (existing) {
        existing.setPosition({ lat: v.lat, lng: v.lng });
      } else {
        vehicleMarkers.current[v.id] = new g.maps.Marker({
          position: { lat: v.lat, lng: v.lng },
          map,
          title: v.label ?? "Matatu",
          icon: {
            path: g.maps.SymbolPath.CIRCLE,
            scale: 9,
            fillColor: "#f4c430",
            fillOpacity: 1,
            strokeColor: "#0a5f3d",
            strokeWeight: 2,
          },
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
  }, [vehicles]);

  return <div ref={ref} className={className ?? "h-[420px] w-full rounded-2xl border border-border"} />;
}
