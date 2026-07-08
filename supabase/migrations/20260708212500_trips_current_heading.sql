-- The frontend (drive.trip.tsx GPS broadcast, ride.$routeId.tsx heading display) has
-- assumed trips.current_heading exists since GPS broadcasting was built, but no prior
-- migration ever added it. This means driver heading updates have been silently failing
-- at the database level. This migration adds the column and updates get_trip_location to
-- return it so the passenger map can show direction of travel again.
ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS current_heading double precision;

CREATE OR REPLACE FUNCTION public.get_trip_location(_trip_id uuid)
RETURNS TABLE(current_lat double precision, current_lng double precision, current_heading double precision)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.current_lat, t.current_lng, t.current_heading
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
