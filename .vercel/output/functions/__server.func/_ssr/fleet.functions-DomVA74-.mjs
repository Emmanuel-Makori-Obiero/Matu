import { i as TSS_SERVER_FUNCTION, l as createServerFn } from "./esm-9EjmF9OT.mjs";
import { t as requireSupabaseAuth } from "./auth-middleware-DIQeP8rF.mjs";
import { n as stringType, t as objectType } from "../_libs/zod.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/fleet.functions-DomVA74-.js
var createServerRpc = (serverFnMeta, splitImportFn) => {
	const url = "/_serverFn/" + serverFnMeta.id;
	return Object.assign(splitImportFn, {
		url,
		serverFnMeta,
		[TSS_SERVER_FUNCTION]: true
	});
};
var assignSaccoDriver_createServerFn_handler = createServerRpc({
	id: "7f771bda0e6e12e865f03fc21b8a7a99d90e9aab4714996ddcb9527e7f1994c4",
	name: "assignSaccoDriver",
	filename: "src/lib/fleet.functions.ts"
}, (opts) => assignSaccoDriver.__executeServer(opts));
var assignSaccoDriver = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).validator((data) => objectType({
	vehicleId: stringType().uuid(),
	phone: stringType().min(3)
}).parse(data)).handler(assignSaccoDriver_createServerFn_handler, async ({ data, context }) => {
	const { supabaseAdmin } = await import("./client.server-pv5dszoL.mjs");
	const { data: vehicle, error: vehicleError } = await context.supabase.from("vehicles").select("id,saccos!inner(owner_id)").eq("id", data.vehicleId).maybeSingle();
	if (vehicleError) throw new Error(vehicleError.message);
	if (!vehicle || vehicle.saccos.owner_id !== context.userId) throw new Error("You can only assign drivers to your own SACCO vehicles");
	const digits = data.phone.replace(/\D/g, "");
	const { data: profiles, error: profileError } = await supabaseAdmin.from("profiles").select("id,full_name,phone").limit(50);
	if (profileError) throw new Error(profileError.message);
	const driver = (profiles ?? []).find((p) => p.phone?.trim() === data.phone.trim() || p.phone?.replace(/\D/g, "") === digits);
	if (!driver) throw new Error("No registered user found with that phone number");
	const { error: roleError } = await supabaseAdmin.from("user_roles").insert({
		user_id: driver.id,
		role: "driver"
	});
	if (roleError && roleError.code !== "23505") throw new Error(roleError.message);
	const { error: updateError } = await context.supabase.from("vehicles").update({ driver_id: driver.id }).eq("id", data.vehicleId);
	if (updateError) throw new Error(updateError.message);
	return {
		driver_id: driver.id,
		full_name: driver.full_name,
		phone: driver.phone
	};
});
//#endregion
export { assignSaccoDriver_createServerFn_handler };
