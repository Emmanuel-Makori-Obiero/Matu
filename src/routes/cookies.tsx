// FILE: src/routes/cookies.tsx
// Public page — no auth required.
import { createFileRoute, Link } from "@tanstack/react-router";
import { Bus, ArrowLeft } from "lucide-react";
import { resetConsent } from "@/lib/cookie-consent";

export const Route = createFileRoute("/cookies")({
  head: () => ({
    meta: [
      { title: "Cookie Policy · Matu" },
      { name: "description", content: "How Matu uses cookies." },
    ],
  }),
  component: CookiesPage,
});

const LAST_UPDATED = "15 September 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-display text-lg font-semibold text-foreground">{title}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

function CookiesPage() {
  function handleManagePreferences() {
    resetConsent();
    window.location.reload(); // banner reappears since getConsent() now returns null
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link to="/" className="flex items-center gap-2">
            <Bus className="size-5 text-primary" />
            <span className="font-display text-lg font-bold">Matu</span>
          </Link>
          <Link
            to="/"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Back
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="font-display text-3xl font-bold text-foreground">Cookie Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          This policy explains how Matu (operated by Thamana Solutions) uses cookies and similar
          storage on matu.co.ke, and the choices you have over them.
        </p>

        <Section title="1. What cookies we use">
          <p>
            <strong>Necessary:</strong> keeps you signed in and remembers your role view (passenger,
            driver, SACCO admin). Always on — Matu can't function without these.
          </p>
          <p>
            <strong>Preferences:</strong> remembers choices like your light/dark theme so you don't
            have to reset them each visit.
          </p>
          <p>
            <strong>Analytics:</strong> helps us understand how the app is used so we can fix issues
            and improve it.
          </p>
          <p>
            <strong>Marketing:</strong> reserved for future promotional use. Matu doesn't currently
            run any marketing cookies.
          </p>
        </Section>

        <Section title="2. Your choices">
          <p>
            When you first visit, a banner lets you accept all cookies, reject everything except
            necessary ones, or customize each category individually. You can change your mind at any
            time below.
          </p>
          <button
            onClick={handleManagePreferences}
            className="mt-2 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-medium hover:bg-secondary"
          >
            Manage cookie preferences
          </button>
        </Section>

        <Section title="3. Changes to this policy">
          <p>
            We'll update the "Last updated" date above if this policy changes, and notify you in-app
            for material changes.
          </p>
        </Section>

        <Section title="4. Contact us">
          <p>Thamana Solutions, Nairobi, Kenya</p>
          <p>
            Email:{" "}
            <a className="text-primary underline" href="mailto:emmanuelmakobiero@gmail.com">
              emmanuelmakobiero@gmail.com
            </a>
          </p>
        </Section>

        <div className="mt-10 flex gap-4 border-t border-border pt-6 text-sm">
          <Link to="/privacy" className="text-primary underline">
            Privacy Policy
          </Link>
          <Link to="/terms" className="text-primary underline">
            Terms of Service
          </Link>
        </div>
      </main>
    </div>
  );
}
