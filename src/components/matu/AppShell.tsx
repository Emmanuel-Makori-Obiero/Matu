import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Bus, LogOut, User, Steering, Building2 } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const NAV = [
  { to: "/ride" as const, label: "Ride", icon: User, role: "passenger" as const },
  { to: "/drive" as const, label: "Drive", icon: Bus, role: "driver" as const },
  { to: "/fleet" as const, label: "SACCO", icon: Building2, role: "sacco_admin" as const },
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

  async function signOut() {
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/auth", replace: true });
  }

  async function switchTo(to: "/ride" | "/drive" | "/fleet", role: "passenger" | "driver" | "sacco_admin") {
    // Claim role (idempotent) so RLS-protected actions work in that dashboard.
    await supabase.rpc("claim_role", { _role: role });
    navigate({ to });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className={`border-b border-border ${accent === "accent" ? "bg-accent text-accent-foreground" : "bg-primary text-primary-foreground"}`}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <Link to="/" className="flex items-center gap-2">
            <span className="relative grid size-8 place-items-center overflow-hidden rounded-lg bg-surface/15">
              <span className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 bg-accent" />
              <Bus className="relative z-10 size-4" />
            </span>
            <span className="font-display text-xl font-bold">Matu</span>
          </Link>
          <div className="flex items-center gap-1">
            {NAV.map((n) => {
              const active = pathname.startsWith(n.to);
              return (
                <button
                  key={n.to}
                  onClick={() => switchTo(n.to, n.role)}
                  className={`hidden sm:inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${active ? "bg-surface text-foreground" : "bg-surface/15 hover:bg-surface/25"}`}
                >
                  <n.icon className="size-4" /> {n.label}
                </button>
              );
            })}
            <button
              onClick={signOut}
              className="ml-1 inline-flex items-center gap-1.5 rounded-md bg-surface/15 px-3 py-1.5 text-sm font-medium hover:bg-surface/25"
            >
              <LogOut className="size-4" /> <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-5 pb-6 pt-2">
          {/* Mobile role switcher */}
          <div className="mb-3 flex gap-1 sm:hidden">
            {NAV.map((n) => {
              const active = pathname.startsWith(n.to);
              return (
                <button
                  key={n.to}
                  onClick={() => switchTo(n.to, n.role)}
                  className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition ${active ? "bg-surface text-foreground" : "bg-surface/15"}`}
                >
                  {n.label}
                </button>
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
