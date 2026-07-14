import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

// navigator.onLine is a decent first signal but it's known to lie in some
// cases (e.g. connected to a wifi with no real internet). Good enough for a
// "you're probably offline" banner though — the real safety net is that
// every read falls back to cache and every write gets queued regardless of
// what this says.
export function useOnlineStatus() {
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  useEffect(() => {
    function goOnline() {
      setOnline(true);
    }
    function goOffline() {
      setOnline(false);
    }
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
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
