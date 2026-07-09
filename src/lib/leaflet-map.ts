// Shared Leaflet/OpenStreetMap setup. No API key, no billing, ever.
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Leaflet's default marker icons reference image paths that don't resolve correctly
// under bundlers like Vite. Fix once, here, so every map gets working default icons.
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

export const NAIROBI_CENTER = { lat: -1.286389, lng: 36.817223 };

export { L };
