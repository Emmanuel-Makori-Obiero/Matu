import { supabase } from "@/integrations/supabase/client";

export type AppRole = "passenger" | "driver" | "conductor" | "sacco_admin";

export const ROLE_HOME: Record<AppRole, string> = {
  passenger: "/ride",
  driver: "/drive",
  conductor: "/drive",
  sacco_admin: "/fleet",
};

export async function fetchPrimaryRole(userId: string): Promise<AppRole> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error || !data || data.length === 0) return "passenger";
  const order: AppRole[] = ["sacco_admin", "driver", "conductor", "passenger"];
  for (const r of order) {
    if (data.some((d) => d.role === r)) return r;
  }
  return "passenger";
}

export async function homePathForUser(userId: string) {
  const role = await fetchPrimaryRole(userId);
  return ROLE_HOME[role];
}
