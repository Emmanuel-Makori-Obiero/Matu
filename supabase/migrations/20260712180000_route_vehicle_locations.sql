-- ============== FIX: /ride/track shows "no matatus active" despite live GPS data ==============
-- get_trip_location() (added in 20260708212500_trips_current_heading.sql) only returns a
-- trip's position to its driver, a passenger who has ALREADY booked that specific trip, or
-- the owning sacco — which is the right rule for a single booking's tracking page
-- (ride.track.$bookingId.tsx), but wrong for ride.track.tsx, which is explicitly meant to
-- let a passenger see every active vehicle on a route BEFORE booking, so they can decide
-- whether to board. That page was calling get_trip_location per-trip and silently getting
-- nothing back, since the passenger has no booking yet.
--
-- This is a routine public-transit-tracker feature (like knowing where the next bus is
-- before you board it), not a privacy-sensitive one — the fix is a separate function scoped
-- to "any active trip on a given route," not a further loosening of get_trip_location itself.
CREATE OR REPLACE FUNCTION public.get_route_active_vehicle_locations(_route_id uuid)
RETURNS TABLE(
  trip_id uuid,
  vehicle_id uuid,
  current_lat double precision,
  current_lng double precision,
  current_heading double precision
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id, t.vehicle_id, t.current_lat, t.current_lng, t.current_heading
  FROM public.trips t
  WHERE t.route_id = _route_id
    AND t.status IN ('boarding', 'in_transit')
    AND t.current_lat IS NOT NULL
    AND t.current_lng IS NOT NULL
$$;

REVOKE EXECUTE ON FUNCTION public.get_route_active_vehicle_locations(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_route_active_vehicle_locations(uuid) TO authenticated;
