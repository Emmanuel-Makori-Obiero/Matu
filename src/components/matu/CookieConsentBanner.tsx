// FILE: src/components/matu/CookieConsentBanner.tsx
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Cookie } from "lucide-react";
import {
  getConsent,
  saveConsent,
  ACCEPT_ALL,
  REJECT_NON_ESSENTIAL,
  type CookieConsent,
} from "@/lib/cookie-consent";

const CATEGORIES: {
  key: keyof Omit<CookieConsent, "necessary">;
  label: string;
  desc: string;
}[] = [
  {
    key: "preferences",
    label: "Preferences",
    desc: "Remembers settings like theme and your default role view.",
  },
  {
    key: "analytics",
    label: "Analytics",
    desc: "Helps us see how the app is used so we can fix issues and improve it.",
  },
  {
    key: "marketing",
    label: "Marketing",
    desc: "Used for promotional content. Matu doesn't currently run this, reserved for future use.",
  },
];

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [choices, setChoices] = useState<Omit<CookieConsent, "necessary">>(REJECT_NON_ESSENTIAL);

  useEffect(() => {
    if (!getConsent()) setVisible(true);
  }, []);

  function commit(next: Omit<CookieConsent, "necessary">) {
    saveConsent(next);
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-surface px-4 py-4 shadow-lg">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-start gap-2 text-sm text-muted-foreground">
          <Cookie className="mt-0.5 size-4 shrink-0 text-primary" />
          <p>
            Matu uses cookies. Necessary ones keep you signed in; others are optional and you
            choose. See our{" "}
            <Link to="/cookies" className="text-primary underline">
              Cookie Policy
            </Link>
            .
          </p>
        </div>

        {expanded && (
          <div className="mt-4 space-y-3 border-t border-border pt-4">
            <div className="flex items-start justify-between gap-3 opacity-60">
              <div>
                <p className="text-sm font-medium text-foreground">Necessary</p>
                <p className="text-xs text-muted-foreground">
                  Required for login and core features. Always on.
                </p>
              </div>
              <input type="checkbox" checked disabled className="mt-1 accent-primary" />
            </div>
            {CATEGORIES.map((c) => (
              <div key={c.key} className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{c.label}</p>
                  <p className="text-xs text-muted-foreground">{c.desc}</p>
                </div>
                <input
                  type="checkbox"
                  checked={choices[c.key]}
                  onChange={(e) => setChoices((prev) => ({ ...prev, [c.key]: e.target.checked }))}
                  className="mt-1 accent-primary"
                />
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {!expanded && (
            <button
              onClick={() => setExpanded(true)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-secondary"
            >
              Customize
            </button>
          )}
          <button
            onClick={() => commit(REJECT_NON_ESSENTIAL)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-secondary"
          >
            Reject non-essential
          </button>
          <button
            onClick={() => commit(expanded ? choices : ACCEPT_ALL)}
            className="rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90"
          >
            {expanded ? "Save preferences" : "Accept all"}
          </button>
        </div>
      </div>
    </div>
  );
}
