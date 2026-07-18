import type { VehicleKind } from "@/components/matu/RouteMap";

// The vehicles table stores a specific vehicle_type enum
// ('matatu_14' | 'matatu_25' | 'bus_33' | 'bus_51'), but the map only ever
// needs to know whether to draw the common matatu icon or the common bus
// icon. Centralizing that mapping here means every screen that draws
// vehicles on the map stays consistent even as vehicle_type values evolve.
export function vehicleKindFromType(vehicleType: string | null | undefined): VehicleKind {
  return vehicleType?.startsWith("bus") ? "bus" : "matatu";
}
