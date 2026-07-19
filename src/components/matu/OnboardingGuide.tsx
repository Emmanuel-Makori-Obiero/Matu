// FILE: src/components/matu/OnboardingGuide.tsx
// A one-time, plain-language walkthrough shown to first-time passengers. Stored in
// a cookie (90-day expiry) so it only appears once per device for a limited window,
// then resurfaces — reopenable any time via the "How this works" link on the search
// page. A cookie (vs. localStorage) also means the flag is visible across tabs
// immediately, e.g. if onboarding is dismissed in one tab it won't flash in another.
import { useEffect, useState } from "react";
import { LocateFixed, Search, Ticket, MapPinned, X } from "lucide-react";
import { getCookie, setCookie } from "@/lib/cookies";

const STORAGE_KEY = "matu_onboarding_seen_v2";
const SEEN_FOR_DAYS = 90;

const STEPS = [
  {
    icon: LocateFixed,
    title: "1. Tell us where you are",
    body: 'Tap "Use my location" and we\'ll find the nearest matatu stop for you. No typing needed.',
  },
  {
    icon: Search,
    title: "2. Tell us where you're going",
    body: "Type the name of the place you want to go. Matching matatus appear automatically below. No need to press a search button.",
  },
  {
    icon: Ticket,
    title: "3. Pick a matatu and book",
    body: "Tap any matatu in the list to see it on the map and book your seat. Your ticket will be ready to show the conductor.",
  },
  {
    icon: MapPinned,
    title: "4. Track it live, or do more",
    body: "Once booked, watch your matatu's real position and traffic on the map from Track. Need to send a parcel or hire a whole vehicle instead? Find those under Send Parcel and Road Trip.",
  },
];

export function useOnboardingSeen() {
  const [seen, setSeen] = useState(true);
  useEffect(() => {
    setSeen(getCookie(STORAGE_KEY) === "1");
  }, []);
  return seen;
}

export function OnboardingGuide({ onClose }: { onClose: () => void }) {
  function finish() {
    setCookie(STORAGE_KEY, "1", { days: SEEN_FOR_DAYS });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[2000] grid place-items-center bg-black/50 p-4">
      <div className="relative w-full max-w-sm rounded-2xl border border-border bg-background p-6 shadow-lift">
        <button
          onClick={finish}
          aria-label="Close"
          className="absolute right-3 top-3 rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
        >
          <X className="size-4" />
        </button>
        <h2 className="font-display text-lg font-bold">Welcome to Matu 👋</h2>
        <p className="mt-1 text-sm text-muted-foreground">Here's how to get around with Matu.</p>
        <div className="mt-5 grid gap-4">
          {STEPS.map((s) => (
            <div key={s.title} className="flex gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                <s.icon className="size-5" />
              </div>
              <div>
                <div className="text-sm font-semibold">{s.title}</div>
                <div className="mt-0.5 text-sm text-muted-foreground">{s.body}</div>
              </div>
            </div>
          ))}
        </div>
        <button
          onClick={finish}
          className="mt-6 w-full rounded-lg bg-primary py-3 text-base font-medium text-primary-foreground"
        >
          Got it, let's go
        </button>
      </div>
    </div>
  );
}
