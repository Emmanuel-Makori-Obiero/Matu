ALTER FUNCTION public.get_my_sacco_dashboard() SECURITY INVOKER;
REVOKE ALL ON FUNCTION public.get_my_sacco_dashboard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_sacco_dashboard() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_sacco_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_sacco_dashboard() TO service_role;

REVOKE ALL ON FUNCTION public.get_my_sacco_drivers(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_sacco_drivers(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_sacco_drivers(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_sacco_drivers(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.assign_sacco_driver(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assign_sacco_driver(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.assign_sacco_driver(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_sacco_driver(uuid, text) TO service_role;