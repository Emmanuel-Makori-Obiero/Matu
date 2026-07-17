import { useEffect, useRef, useState } from "react";
import { WifiOff } from "lucide-react";

// navigator.onLine is not trustworthy as the deciding signal on its own — on
// some Android/PWA setups it gets stuck reporting `false` permanently and
// never recovers, no matter how good the actual connection is. So this does
// NOT gate showing the banner on navigator.onLine at all anymore. A real
// network request is the only thing that decides:
//   - going OFFLINE requires two consecutive failed probes (avoids a single
//     flaky/slow request flipping the banner on)
//   - coming back ONLINE needs just one successful probe, and happens
//     immediately — recovering fast matters more than being cautious here
// The probe fetches a small static asset with a cache-busting query param
// (so the service worker's cache-first handling for static assets doesn't
// mask a real offline state) instead of HEAD-requesting "/", since that
// route goes through the serverless function and can fail/timeout for
// reasons unrelated to the device's actual connectivity (cold starts,
// method handling quirks, etc).
function probeConnectivity(): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  return fetch(`/icons/icon-192.png?_=${Date.now()}`, {
    method: "GET",
    cache: "no-store",
    signal: controller.signal,
  })
    .then(() => true)
    .catch(() => false)
    .finally(() => clearTimeout(timeout));
}

export function useOnlineStatus() {
  const [online, setOnline] = useState(true);
  const consecutiveFailures = useRef(0);
  const checking = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (checking.current) return;
      checking.current = true;
      const reachable = await probeConnectivity();
      if (cancelled) {
        checking.current = false;
        return;
      }
      if (reachable) {
        consecutiveFailures.current = 0;
        setOnline(true); // recovering is immediate — one good check is enough
      } else {
        consecutiveFailures.current += 1;
        if (consecutiveFailures.current >= 2) {
          setOnline(false);
        }
      }
      checking.current = false;
    }

    check(); // real check on mount — don't trust any initial guess
    window.addEventListener("online", check);
    window.addEventListener("offline", check);
    document.addEventListener("visibilitychange", check);
    // Frequent while this is cheap and matters (a stuck-offline banner is
    // actively confusing) — every 4s is a small cost for fast recovery.
    const interval = setInterval(check, 4000);

    return () => {
      cancelled = true;
      window.removeEventListener("online", check);
      window.removeEventListener("offline", check);
      document.removeEventListener("visibilitychange", check);
      clearInterval(interval);
    };
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
