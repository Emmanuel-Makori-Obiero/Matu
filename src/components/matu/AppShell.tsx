// FILE: src/components/matu/AppShell.tsx
// Replace the whole file with this version. The only real change: instead of letting
// anyone click between Ride / Drive / SACCO and silently "claim" that role, we fetch the
// roles the user ACTUALLY holds and only show tabs for those. Everyone still always has
// "passenger" (riding), but Drive/SACCO only appear once registered for them.

import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Bus, LogOut, User, Building2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/lib/matu-auth";

const NAV = [
  { to: "/ride" as const, label: "Ride", icon: User, role: "passenger" as AppRole },
  { to: "/drive" as const, label: "Drive", icon: Bus, role: "driver" as AppRole },
  { to: "/fleet" as const, label: "SACCO", icon: Building2, role: "sacco_admin" as AppRole },
];

export function AppShell({
  title,
  subtitle,
  accent = "primary",
  tabs,
  children,
}: {
  title: string;
  subtitle?: string;
  accent?: "primary" | "accent";
  tabs?: { to: string; label: string }[];
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [myRoles, setMyRoles] = useState<AppRole[]>([]);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id);
      setMyRoles((roles ?? []).map((r) => r.role as AppRole));
    });
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/auth", replace: true });
  }

  // Only tabs the user actually holds a role for are visible. Passenger is implicit for
  // everyone since anybody can ride. Drive/SACCO require registration (see drive/register
  // and fleet/register flows) before the tab appears.
  const visibleNav = NAV.filter((n) => n.role === "passenger" || myRoles.includes(n.role));

  return (
    <div className="min-h-screen bg-background">
      <header
        className={`border-b border-border ${accent === "accent" ? "bg-accent text-accent-foreground" : "bg-primary text-primary-foreground"}`}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <Link to="/" className="flex items-center gap-2">
            <span className="relative grid size-8 place-items-center overflow-hidden rounded-lg bg-surface/15">
              <span className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 bg-accent" />
              <Bus className="relative z-10 size-4" />
            </span>
            <span className="font-display text-xl font-bold">Matu</span>
          </Link>
          <div className="flex items-center gap-1">
            {visibleNav.map((n) => {
              const active = pathname.startsWith(n.to);
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={`hidden sm:inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${active ? "bg-surface text-foreground" : "bg-surface/15 hover:bg-surface/25"}`}
                >
                  <n.icon className="size-4" /> {n.label}
                </Link>
              );
            })}
            {!myRoles.includes("driver") && (
              <Link
                to="/drive"
                className="hidden sm:inline-flex items-center gap-1.5 rounded-md bg-surface/15 px-3 py-1.5 text-sm font-medium hover:bg-surface/25"
              >
                Become a driver
              </Link>
            )}
            {!myRoles.includes("sacco_admin") && (
              <Link
                to="/fleet"
                className="hidden sm:inline-flex items-center gap-1.5 rounded-md bg-surface/15 px-3 py-1.5 text-sm font-medium hover:bg-surface/25"
              >
                Register a SACCO
              </Link>
            )}
            <button
              onClick={signOut}
              className="ml-1 inline-flex items-center gap-1.5 rounded-md bg-surface/15 px-3 py-1.5 text-sm font-medium hover:bg-surface/25"
            >
              <LogOut className="size-4" /> <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-5 pb-6 pt-2">
          <div className="mb-3 flex gap-1 sm:hidden">
            {visibleNav.map((n) => {
              const active = pathname.startsWith(n.to);
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={`flex-1 rounded-md px-2 py-1.5 text-center text-xs font-medium transition ${active ? "bg-surface text-foreground" : "bg-surface/15"}`}
                >
                  {n.label}
                </Link>
              );
            })}
          </div>
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
    </div>
  );
}
