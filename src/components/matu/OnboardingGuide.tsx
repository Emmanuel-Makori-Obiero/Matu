// FILE: src/components/matu/OnboardingGuide.tsx
// A one-time, plain-language walkthrough shown to first-time passengers. Stored in
// localStorage so it only appears once per device — reopenable any time via the
// "How this works" link left on the search page.
import { useEffect, useState } from "react";
import { LocateFixed, Search, Ticket, X } from "lucide-react";

const STORAGE_KEY = "matu_onboarding_seen_v1";

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
];

export function useOnboardingSeen() {
  const [seen, setSeen] = useState(true);
  useEffect(() => {
    setSeen(localStorage.getItem(STORAGE_KEY) === "1");
  }, []);
  return seen;
}

export function OnboardingGuide({ onClose }: { onClose: () => void }) {
  function finish() {
    localStorage.setItem(STORAGE_KEY, "1");
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
        <p className="mt-1 text-sm text-muted-foreground">Booking a matatu takes 3 easy steps.</p>
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
