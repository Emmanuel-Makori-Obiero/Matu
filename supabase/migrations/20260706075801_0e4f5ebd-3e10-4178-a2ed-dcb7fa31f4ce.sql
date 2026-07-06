
-- 1) Phone on driver join requests + update listing RPC to include it
ALTER TABLE public.driver_join_requests ADD COLUMN IF NOT EXISTS phone text;

CREATE OR REPLACE FUNCTION public.list_sacco_join_requests(_sacco_id uuid)
RETURNS TABLE(id uuid, driver_id uuid, full_name text, phone text, note text, status text, created_at timestamp with time zone)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT r.id, r.driver_id, p.full_name, COALESCE(r.phone, p.phone) AS phone, r.note, r.status, r.created_at
  FROM public.driver_join_requests r
  LEFT JOIN public.profiles p ON p.id = r.driver_id
  WHERE r.sacco_id = _sacco_id
    AND public.is_sacco_owner(_sacco_id)
  ORDER BY r.created_at DESC;
$function$;

REVOKE EXECUTE ON FUNCTION public.list_sacco_join_requests(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_sacco_join_requests(uuid) TO authenticated;

-- 2) Allow drivers to register their OWN personal vehicle (no sacco yet)
DROP POLICY IF EXISTS "Driver inserts own vehicle" ON public.vehicles;
CREATE POLICY "Driver inserts own vehicle"
ON public.vehicles FOR INSERT TO authenticated
WITH CHECK (driver_id = auth.uid() AND sacco_id IS NULL);

-- 3) Allow drivers to also SELECT vehicles across their trips (already covered) — no change
