import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const assignSaccoDriver = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => z.object({ vehicleId: z.string().uuid(), phone: z.string().min(3) }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: vehicle, error: vehicleError } = await context.supabase
      .from("vehicles")
      .select("id,saccos!inner(owner_id)")
      .eq("id", data.vehicleId)
      .maybeSingle();
    if (vehicleError) throw new Error(vehicleError.message);
    if (!vehicle || (vehicle.saccos as unknown as { owner_id: string }).owner_id !== context.userId) {
      throw new Error("You can only assign drivers to your own SACCO vehicles");
    }

    const digits = data.phone.replace(/\D/g, "");
    const { data: profiles, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id,full_name,phone")
      .limit(50);
    if (profileError) throw new Error(profileError.message);
    const driver = (profiles ?? []).find((p) => p.phone?.trim() === data.phone.trim() || p.phone?.replace(/\D/g, "") === digits);
    if (!driver) throw new Error("No registered user found with that phone number");

    const { error: roleError } = await supabaseAdmin.from("user_roles").insert({ user_id: driver.id, role: "driver" });
    if (roleError && roleError.code !== "23505") throw new Error(roleError.message);

    const { error: updateError } = await context.supabase.from("vehicles").update({ driver_id: driver.id }).eq("id", data.vehicleId);
    if (updateError) throw new Error(updateError.message);

    return { driver_id: driver.id, full_name: driver.full_name, phone: driver.phone };
  });