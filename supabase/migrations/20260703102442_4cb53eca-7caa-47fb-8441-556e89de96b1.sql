GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_primary_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_sacco_contact_phone(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_trip_location(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_role(public.app_role) TO authenticated;