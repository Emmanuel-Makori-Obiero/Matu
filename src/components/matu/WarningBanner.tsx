import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Warning = {
  id: string;
  message: string;
  created_at: string;
};

// admin_issue_warning() (platform-admin.tsx) has always written straight to
// admin_warnings, and RLS has always let a user read/acknowledge their own
// rows — but nothing ever displayed them. The comment on the admin side
// ("the user sees it next time they open the app") described a banner that
// was never actually built, so a warning landed in the DB and then visibly
// did nothing. This is that banner.
export function WarningBanner() {
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [dismissing, setDismissing] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user || cancelled) return;
      const { data } = await supabase
        .from("admin_warnings")
        .select("id,message,created_at")
        .eq("user_id", userData.user.id)
        .is("acknowledged_at", null)
        .order("created_at", { ascending: true });
      if (!cancelled) setWarnings((data ?? []) as Warning[]);
    }

    load();
    // Also re-check on auth state changes, so a warning issued while the
    // person is mid-session (or right as they log in) still surfaces
    // without needing a hard refresh.
    const { data: sub } = supabase.auth.onAuthStateChange(() => load());
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function acknowledge(id: string) {
    setDismissing(id);
    const { error } = await supabase
      .from("admin_warnings")
      .update({ acknowledged_at: new Date().toISOString() })
      .eq("id", id);
    setDismissing(null);
    if (error) return; // leave it showing — they can retry the dismiss
    setWarnings((prev) => prev.filter((w) => w.id !== id));
  }

  if (warnings.length === 0) return null;

  return (
    <div className="sticky top-0 z-50 grid gap-px bg-destructive/20">
      {warnings.map((w) => (
        <div
          key={w.id}
          className="flex items-start gap-2 bg-destructive px-3 py-2 text-sm text-destructive-foreground"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Warning from Matu admin</p>
            <p className="mt-0.5">{w.message}</p>
          </div>
          <button
            onClick={() => acknowledge(w.id)}
            disabled={dismissing === w.id}
            className="shrink-0 rounded-md border border-destructive-foreground/40 px-2 py-1 text-xs font-medium hover:bg-destructive-foreground/10 disabled:opacity-50"
          >
            {dismissing === w.id ? "…" : "Got it"}
          </button>
        </div>
      ))}
    </div>
  );
}
