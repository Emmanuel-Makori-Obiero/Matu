CREATE OR REPLACE FUNCTION public.get_my_sacco_drivers(_sacco_id uuid)
RETURNS TABLE(
  driver_id uuid,
  full_name text,
  phone text,
  vehicle_id uuid,
  plate_number text,
  status text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    v.driver_id,
    NULL::text AS full_name,
    NULL::text AS phone,
    v.id AS vehicle_id,
    v.plate_number,
    CASE
      WHEN v.driver_id IS NULL THEN 'unassigned'
      WHEN EXISTS (
        SELECT 1 FROM public.trips t
        WHERE t.vehicle_id = v.id
          AND t.driver_id = v.driver_id
          AND t.status IN ('boarding', 'in_transit')
      ) THEN 'on-trip'
      ELSE 'assigned'
    END AS status
  FROM public.vehicles v
  WHERE v.sacco_id = _sacco_id
    AND EXISTS (SELECT 1 FROM public.saccos s WHERE s.id = v.sacco_id AND s.owner_id = auth.uid())
  ORDER BY v.plate_number;
$$;

REVOKE ALL ON FUNCTION public.get_my_sacco_drivers(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_sacco_drivers(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_sacco_drivers(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_sacco_drivers(uuid) TO service_role;