import { useEffect, useRef, useState } from "react";
import { WifiOff } from "lucide-react";

// Earlier version of this hook required BOTH navigator.onLine AND a failed
// network probe to agree before showing "offline" — meant to stop a bad
// onLine reading alone from showing the banner. But that made the probe's
// failure mode just as dangerous in the other direction: a slow serverless
// cold start, a blocked/CORS'd HEAD request, or a flaky mobile connection
// can fail the probe on its own, and once navigator.onLine *also* happened
// to read false for a moment, the banner got stuck showing even though the
// device was genuinely online — exactly the bug being reported here.
//
// So: navigator.onLine is now the only thing that can turn the banner ON,
// debounced briefly so a one-tick flicker doesn't flash it. The network
// probe is only ever used to turn it back OFF faster (a successful real
// request is good evidence of connectivity even if onLine hasn't caught up
// yet) — it can never keep the banner on by itself.
function probeConnectivity(): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  return fetch("/", { method: "HEAD", cache: "no-store", signal: controller.signal })
    .then(() => true)
    .catch(() => false)
    .finally(() => clearTimeout(timeout));
}

export function useOnlineStatus() {
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    function applyBrowserState() {
      const browserOnline = typeof navigator === "undefined" || navigator.onLine;
      clearTimeout(debounceRef.current);
      if (browserOnline) {
        setOnline(true); // recovering is immediate, never debounced
        return;
      }
      // Going offline is debounced — a brief onLine flicker during a
      // network handoff shouldn't flash the banner on for a second.
      debounceRef.current = setTimeout(() => setOnline(false), 1500);
    }

    applyBrowserState();
    window.addEventListener("online", applyBrowserState);
    window.addEventListener("offline", applyBrowserState);

    // Backstop: if we're currently showing "offline" but a real request
    // actually succeeds, trust that over a stale/wrong onLine reading and
    // recover immediately — this is the "un-stick" path.
    const recoveryCheck = setInterval(async () => {
      if (navigator.onLine) return; // already fine, nothing to recover
      const reachable = await probeConnectivity();
      if (reachable) setOnline(true);
    }, 10_000);

    return () => {
      window.removeEventListener("online", applyBrowserState);
      window.removeEventListener("offline", applyBrowserState);
      clearInterval(recoveryCheck);
      clearTimeout(debounceRef.current);
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
