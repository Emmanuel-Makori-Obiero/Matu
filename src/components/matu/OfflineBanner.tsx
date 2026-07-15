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
  // NOTE: we deliberately do NOT short-circuit on `!navigator.onLine` here.
  // That flag is exactly what the comment above says is unreliable — trusting
  // its "false" without verifying defeats the whole point of this function
  // and was the actual bug: a bad onLine reading (or a stale 'offline' event
  // firing on wifi<->cellular handoff) made the banner show even while the
  // device had a perfectly working connection. Always do the real request;
  // only its result decides the banner.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  return fetch("/", {
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
  const consecutiveFailures = useRef(0);

  async function recheck() {
    if (checking.current) return;
    checking.current = true;
    const result = await checkConnectivity();
    if (result) {
      consecutiveFailures.current = 0;
      setOnline(true); // one successful check is enough to recover immediately
    } else {
      consecutiveFailures.current += 1;
      // Never show "offline" on a failed check alone. The browser's own
      // navigator.onLine has to agree too — this is the actual fix for the
      // banner getting stuck on: some hosting/preview setups block or fail
      // this verification request even though the real connection (and
      // navigator.onLine) is fine, and a failed fetch alone was enough to
      // flip the banner on. Requiring both signals means a broken/blocked
      // fetch can no longer show "offline" by itself.
      const browserAgrees = typeof navigator !== "undefined" && !navigator.onLine;
      if (consecutiveFailures.current >= 2 && browserAgrees) {
        setOnline(false);
      } else if (consecutiveFailures.current < 2) {
        setTimeout(recheck, 3000); // quick follow-up check before giving up
      }
      // else: two failures but the browser still thinks we're online — trust
      // the browser and stay online rather than get stuck showing the banner.
    }
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
