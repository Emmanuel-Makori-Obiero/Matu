// Shared Google Maps JS loader. Uses the referrer-restricted browser key.
let loader: Promise<typeof google> | null = null;

export function loadGoogleMaps(): Promise<typeof google> {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  const windowWithGoogle = window as Window & { google?: typeof google };
  if (windowWithGoogle.google?.maps) return Promise.resolve(windowWithGoogle.google);
  if (loader) return loader;

  const key = import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY as string;
  const channel = import.meta.env.VITE_GOOGLE_MAPS_TRACKING_ID as string;

  loader = new Promise((resolve, reject) => {
    const windowWithInit = window as Window & { __matuInitMap?: (value: typeof google) => void };
    windowWithInit.__matuInitMap = () => resolve(windowWithGoogle.google!);
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async&callback=__matuInitMap&channel=${channel}`;
    s.async = true;
    s.defer = true;
    s.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(s);
  });
  return loader;
}

export const NAIROBI_CENTER = { lat: -1.286389, lng: 36.817223 };
