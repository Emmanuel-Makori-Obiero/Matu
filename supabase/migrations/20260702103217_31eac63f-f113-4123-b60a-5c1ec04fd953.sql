
DROP POLICY IF EXISTS "Anyone can view routes" ON public.routes;
CREATE POLICY "Authenticated view routes" ON public.routes FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.routes FROM anon;

DROP POLICY IF EXISTS "Anyone can view stages" ON public.stages;
CREATE POLICY "Authenticated view stages" ON public.stages FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.stages FROM anon;

DROP POLICY IF EXISTS "Authenticated view saccos" ON public.saccos;

DROP POLICY IF EXISTS "Authenticated view vehicles" ON public.vehicles;
CREATE POLICY "Scoped view vehicles" ON public.vehicles FOR SELECT TO authenticated
USING (
  driver_id = auth.uid()
  OR sacco_id IN (SELECT id FROM public.saccos WHERE owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.trips t WHERE t.vehicle_id = vehicles.id AND t.status IN ('scheduled','boarding','in_transit'))
);

CREATE POLICY "Deny insert escrow" ON public.escrow_transactions FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "Deny update escrow" ON public.escrow_transactions FOR UPDATE TO authenticated USING (false);
CREATE POLICY "Deny delete escrow" ON public.escrow_transactions FOR DELETE TO authenticated USING (false);

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
