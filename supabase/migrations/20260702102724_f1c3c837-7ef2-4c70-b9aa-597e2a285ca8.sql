
-- 1. saccos.contact_phone: revoke column read from authenticated (owner can fetch via RPC)
REVOKE SELECT (contact_phone) ON public.saccos FROM authenticated;
REVOKE SELECT (contact_phone) ON public.saccos FROM anon;

CREATE OR REPLACE FUNCTION public.get_my_sacco_contact_phone(_sacco_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT contact_phone FROM public.saccos
  WHERE id = _sacco_id AND owner_id = auth.uid()
$$;
REVOKE EXECUTE ON FUNCTION public.get_my_sacco_contact_phone(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_sacco_contact_phone(uuid) TO authenticated;

-- 2. trips: hide live GPS columns from broad reads
REVOKE SELECT (current_lat, current_lng) ON public.trips FROM authenticated;
REVOKE SELECT (current_lat, current_lng) ON public.trips FROM anon;

CREATE OR REPLACE FUNCTION public.get_trip_location(_trip_id uuid)
RETURNS TABLE(current_lat double precision, current_lng double precision)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.current_lat, t.current_lng
  FROM public.trips t
  WHERE t.id = _trip_id
    AND (
      t.driver_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.trip_id = t.id AND b.passenger_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.vehicles v
        JOIN public.saccos s ON s.id = v.sacco_id
        WHERE v.id = t.vehicle_id AND s.owner_id = auth.uid()
      )
    )
$$;
REVOKE EXECUTE ON FUNCTION public.get_trip_location(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_trip_location(uuid) TO authenticated;

-- 3. user_roles: explicit deny for direct writes by authenticated users
CREATE POLICY "Deny direct role inserts"
  ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "Deny direct role updates"
  ON public.user_roles FOR UPDATE TO authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY "Deny direct role deletes"
  ON public.user_roles FOR DELETE TO authenticated
  USING (false);
