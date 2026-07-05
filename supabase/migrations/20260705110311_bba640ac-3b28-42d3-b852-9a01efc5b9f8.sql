
-- Break potential recursion by routing cross-table checks through SECURITY DEFINER helpers.

CREATE OR REPLACE FUNCTION public.is_sacco_owner(_sacco_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.saccos WHERE id = _sacco_id AND owner_id = auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.owns_vehicle_sacco(_vehicle_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.vehicles v
    JOIN public.saccos s ON s.id = v.sacco_id
    WHERE v.id = _vehicle_id AND s.owner_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.is_trip_driver(_trip_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.trips WHERE id = _trip_id AND driver_id = auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.can_manage_route(_route_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.routes r
    WHERE r.id = _route_id
      AND (r.created_by = auth.uid()
           OR EXISTS (SELECT 1 FROM public.saccos s WHERE s.id = r.sacco_id AND s.owner_id = auth.uid()))
  )
$$;

CREATE OR REPLACE FUNCTION public.vehicle_has_active_trip(_vehicle_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.vehicle_id = _vehicle_id
      AND t.status IN ('scheduled','boarding','in_transit')
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_sacco_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owns_vehicle_sacco(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_trip_driver(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_route(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vehicle_has_active_trip(uuid) TO authenticated;

-- alerts
DROP POLICY IF EXISTS "Driver creates alerts" ON public.alerts;
DROP POLICY IF EXISTS "Driver views trip alerts" ON public.alerts;
CREATE POLICY "Driver creates alerts" ON public.alerts FOR INSERT TO authenticated
  WITH CHECK (public.is_trip_driver(trip_id));
CREATE POLICY "Driver views trip alerts" ON public.alerts FOR SELECT TO authenticated
  USING (public.is_trip_driver(trip_id));

-- bookings
DROP POLICY IF EXISTS "Driver updates trip bookings" ON public.bookings;
DROP POLICY IF EXISTS "Driver views trip bookings" ON public.bookings;
CREATE POLICY "Driver updates trip bookings" ON public.bookings FOR UPDATE TO authenticated
  USING (public.is_trip_driver(trip_id));
CREATE POLICY "Driver views trip bookings" ON public.bookings FOR SELECT TO authenticated
  USING (public.is_trip_driver(trip_id));

-- escrow
DROP POLICY IF EXISTS "Sacco owner views escrow" ON public.escrow_transactions;
CREATE POLICY "Sacco owner views escrow" ON public.escrow_transactions FOR SELECT TO authenticated
  USING (public.is_sacco_owner(sacco_id));

-- routes
DROP POLICY IF EXISTS "Creator or sacco owner manages route" ON public.routes;
CREATE POLICY "Creator or sacco owner manages route" ON public.routes FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.is_sacco_owner(sacco_id));

-- stages
DROP POLICY IF EXISTS "Route owners add stages" ON public.stages;
CREATE POLICY "Route owners add stages" ON public.stages FOR INSERT TO authenticated
  WITH CHECK (added_by = auth.uid() AND public.can_manage_route(route_id));

-- trips
DROP POLICY IF EXISTS "Sacco owner updates fleet trips" ON public.trips;
CREATE POLICY "Sacco owner updates fleet trips" ON public.trips FOR UPDATE TO authenticated
  USING (public.owns_vehicle_sacco(vehicle_id))
  WITH CHECK (public.owns_vehicle_sacco(vehicle_id));

-- vehicles
DROP POLICY IF EXISTS "Sacco owner manages sacco vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Scoped view vehicles" ON public.vehicles;
CREATE POLICY "Sacco owner manages sacco vehicles" ON public.vehicles FOR ALL TO authenticated
  USING (public.is_sacco_owner(sacco_id))
  WITH CHECK (public.is_sacco_owner(sacco_id));
CREATE POLICY "Scoped view vehicles" ON public.vehicles FOR SELECT TO authenticated
  USING (
    driver_id = auth.uid()
    OR public.is_sacco_owner(sacco_id)
    OR public.vehicle_has_active_trip(id)
  );
