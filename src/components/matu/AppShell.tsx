// FILE: src/components/matu/AppShell.tsx
// Each signed-in user only ever sees the app for their own role — no Ride/Drive/SACCO
// switcher, no "become a driver" / "register a SACCO" cross-promo. Role is chosen once
// at signup (see auth.tsx) and homePathForUser() sends every login straight there.

import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Bus, LogOut, Settings, HelpCircle } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AIAssistant, type AssistantContext } from "@/components/matu/AIAssistant";
import { ThemeToggleCompact } from "@/components/matu/ThemeToggle";

// Fixed Matu brand mark — same green/gold badge used on the public landing page
// (routes/index.tsx). Deliberately NOT theme-derived (bg-primary/bg-accent etc.):
// the logo should read as "Matu" at a glance no matter which theme (light/dark/
// pink) is active, rather than recoloring into whatever accent the theme picks.
const LOGO_GREEN = "#0f5132";
const LOGO_GOLD = "#f4d03f";

function BrandMark() {
  return (
    <span
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-full"
      style={{ backgroundColor: LOGO_GREEN }}
    >
      <Bus size={18} color={LOGO_GOLD} strokeWidth={2.2} />
    </span>
  );
}

// Every authenticated page renders through AppShell, so mounting the assistant here once
// means it's on every page automatically — no per-page wiring needed. The context is
// auto-detected from the URL so the assistant knows whether it's talking to a passenger,
// a driver, or a SACCO admin, and adjusts what it helps with accordingly. A page can still
// pass `assistantContext` explicitly (e.g. to include a specific route/trip id) when it
// has more specific info than the URL alone provides.
function detectContext(pathname: string): AssistantContext {
  if (pathname.startsWith("/drive")) {
    return pathname.startsWith("/drive/trip") ? { page: "driver_trip" } : { page: "driver_home" };
  }
  if (pathname.startsWith("/fleet")) {
    return { page: "sacco_admin" };
  }
  if (pathname.startsWith("/account")) {
    return { page: "account" };
  }
  if (pathname === "/ride/history" || pathname.startsWith("/ride/history")) {
    return { page: "passenger_history" };
  }
  if (pathname.startsWith("/ride/track")) {
    return { page: "passenger_tracking" };
  }
  if (pathname.startsWith("/ride/") && pathname !== "/ride/history") {
    return { page: "passenger_route_details" };
  }
  if (pathname.startsWith("/wallet")) {
    return { page: "passenger_wallet" };
  }
  if (pathname.startsWith("/verify")) {
    return { page: "passenger_verify" };
  }
  if (pathname.startsWith("/complaints")) {
    return { page: "passenger_complaint" };
  }
  if (pathname.startsWith("/platform-admin")) {
    return { page: "platform_admin" };
  }
  return { page: "passenger_search" };
}

export function AppShell({
  title,
  subtitle,
  accent = "primary",
  tabs,
  assistantContext,
  children,
}: {
  title: string;
  subtitle?: string;
  accent?: "primary" | "accent";
  tabs?: { to: string; label: string }[];
  assistantContext?: AssistantContext;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  async function signOut() {
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background">
      <header
        className={`border-b border-border ${accent === "accent" ? "bg-accent text-accent-foreground" : "bg-primary text-primary-foreground"}`}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <Link to="/" className="flex items-center gap-2">
            <BrandMark />
            <span className="font-display text-xl font-bold">Matu</span>
          </Link>
          <div className="flex items-center gap-1">
            <ThemeToggleCompact />
            <Link
              to="/help"
              className="inline-flex items-center gap-1.5 rounded-md bg-surface/15 px-3 py-1.5 text-sm font-medium hover:bg-surface/25"
            >
              <HelpCircle className="size-4" /> <span className="hidden sm:inline">Help</span>
            </Link>
            <Link
              to="/account"
              className="inline-flex items-center gap-1.5 rounded-md bg-surface/15 px-3 py-1.5 text-sm font-medium hover:bg-surface/25"
            >
              <Settings className="size-4" /> <span className="hidden sm:inline">Account</span>
            </Link>
            <button
              onClick={signOut}
              className="ml-1 inline-flex items-center gap-1.5 rounded-md bg-surface/15 px-3 py-1.5 text-sm font-medium hover:bg-surface/25"
            >
              <LogOut className="size-4" /> <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-5 pb-6 pt-2">
          <h1 className="font-display text-3xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm opacity-80">{subtitle}</p>}
          {tabs && tabs.length > 0 && (
            <nav className="mt-5 flex gap-1 overflow-x-auto">
              {tabs.map((t) => {
                const active = pathname === t.to || pathname.startsWith(t.to + "/");
                return (
                  <Link
                    key={t.to}
                    to={t.to}
                    className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition ${active ? "bg-surface text-foreground" : "text-current opacity-80 hover:opacity-100"}`}
                  >
                    {t.label}
                  </Link>
                );
              })}
            </nav>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>
      {pathname !== "/help" && (
        <AIAssistant context={assistantContext ?? detectContext(pathname)} />
      )}
    </div>
  );
}
