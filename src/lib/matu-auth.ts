// FILE: src/lib/matu-auth.ts
import { supabase } from "@/integrations/supabase/client";
import { getCookie, setCookie } from "@/lib/cookies";

export type AppRole = "passenger" | "driver" | "conductor" | "sacco_admin";

export const ROLE_HOME: Record<AppRole, string> = {
  passenger: "/ride",
  driver: "/drive",
  conductor: "/drive",
  sacco_admin: "/fleet",
};

// Cache the user's last-resolved role in a cookie so a returning user can be
// redirected to their dashboard instantly on next login, without waiting on
// the user_roles DB round trip. This is a UX shortcut only — it's always
// re-verified against the DB in fetchPrimaryRole, never trusted for access
// control. A cookie (not localStorage) so it's readable server-side later if
// Matu ever adds an SSR login redirect.
const ROLE_VIEW_KEY = "matu_role_view";
const ROLE_VIEW_DAYS = 30;

const VALID_ROLES: AppRole[] = ["passenger", "driver", "conductor", "sacco_admin"];

/** Best-effort cached role for instant UI decisions (e.g. a loading-state redirect guess). Never used for access control. */
export function getCachedRoleView(): AppRole | null {
  const value = getCookie(ROLE_VIEW_KEY);
  return (VALID_ROLES as string[]).includes(value ?? "") ? (value as AppRole) : null;
}

export async function fetchPrimaryRole(userId: string): Promise<AppRole> {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error || !data || data.length === 0) return "passenger";
  const order: AppRole[] = ["sacco_admin", "driver", "conductor", "passenger"];
  for (const r of order) {
    if (data.some((d) => d.role === r)) {
      setCookie(ROLE_VIEW_KEY, r, { days: ROLE_VIEW_DAYS });
      return r;
    }
  }
  setCookie(ROLE_VIEW_KEY, "passenger", { days: ROLE_VIEW_DAYS });
  return "passenger";
}

export async function homePathForUser(userId: string) {
  const role = await fetchPrimaryRole(userId);

  // A passenger mid-trip shouldn't land on the search/dashboard screen —
  // drop them straight into the live tracking view for that booking, same
  // map the driver is looking at. "Active" = the matatu is actually moving
  // toward them or they're on it (confirmed/boarded); a merely "reserved"
  // (unpaid) booking isn't worth hijacking the login redirect for.
  if (role === "passenger") {
    const { data, error } = await supabase
      .from("bookings")
      .select("id")
      .eq("passenger_id", userId)
      .in("status", ["confirmed", "boarded"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!error && data) {
      return `/ride/track/${data.id}`;
    }
  }

  return ROLE_HOME[role];
}
