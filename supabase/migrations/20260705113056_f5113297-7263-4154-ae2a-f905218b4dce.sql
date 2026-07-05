
-- Revoke EXECUTE from PUBLIC and anon on all SECURITY DEFINER functions in public schema.
-- These functions are only meant for signed-in users (via RLS helpers or RPC).
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_primary_role(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_sacco_contact_phone(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_trip_location(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.claim_role(public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_sacco_owner(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.owns_vehicle_sacco(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_trip_driver(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_route(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.vehicle_has_active_trip(uuid) FROM PUBLIC, anon;

-- Ensure authenticated retains needed access (RLS helpers + claim_role RPC).
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_primary_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_sacco_contact_phone(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_trip_location(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_role(public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_sacco_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owns_vehicle_sacco(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_trip_driver(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_route(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vehicle_has_active_trip(uuid) TO authenticated;
