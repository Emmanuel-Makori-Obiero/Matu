import { useEffect, useRef, useState } from "react";
import { WifiOff } from "lucide-react";

// navigator.onLine's 'online'/'offline' events are known to be unreliable on
// mobile — a wifi<->cellular handoff, a brief captive-portal check, or some
// Android OEM power-saving quirks can fire 'offline' and then just never
// fire 'online' again, leaving the banner stuck showing even once the
// connection is fine. So instead of trusting the events alone, this also
// actively re-verifies with a real network request whenever there's a
// reason to suspect the state changed (an event fires, the tab regains
// focus, or a periodic backstop timer), and only trusts that result.
function checkConnectivity(): Promise<boolean> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return Promise.resolve(false);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  return fetch("/manifest.webmanifest", {
    method: "HEAD",
    cache: "no-store",
    signal: controller.signal,
  })
    .then(() => true)
    .catch(() => false)
    .finally(() => clearTimeout(timeout));
}

export function useOnlineStatus() {
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const checking = useRef(false);

  async function recheck() {
    if (checking.current) return;
    checking.current = true;
    const result = await checkConnectivity();
    setOnline(result);
    checking.current = false;
  }

  useEffect(() => {
    recheck(); // resolve any SSR/hydration mismatch immediately with a real check
    window.addEventListener("online", recheck);
    window.addEventListener("offline", recheck);
    document.addEventListener("visibilitychange", recheck);
    // Backstop in case every event above misses a transition (rare, but the
    // whole reason this rewrite exists is that mobile browsers do miss them).
    const interval = setInterval(recheck, 30_000);
    return () => {
      window.removeEventListener("online", recheck);
      window.removeEventListener("offline", recheck);
      document.removeEventListener("visibilitychange", recheck);
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return online;
}

export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-amber-500 px-3 py-1.5 text-xs font-semibold text-amber-950">
      <WifiOff className="size-3.5" />
      You&rsquo;re offline — showing the last synced data.
    </div>
  );
}
