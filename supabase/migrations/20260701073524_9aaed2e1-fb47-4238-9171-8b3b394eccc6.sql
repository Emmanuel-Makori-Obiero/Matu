
-- 1. Lock down SECURITY DEFINER functions from direct execution
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_primary_role(uuid) FROM PUBLIC, anon, authenticated;
-- keep service_role able to invoke
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_primary_role(uuid) TO service_role;

-- 2. profiles: restrict SELECT to own profile only
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;
CREATE POLICY "Users view own profile"
ON public.profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- 3. saccos: restrict SELECT to authenticated users
DROP POLICY IF EXISTS "Anyone can view saccos" ON public.saccos;
CREATE POLICY "Authenticated view saccos"
ON public.saccos FOR SELECT
TO authenticated
USING (true);

-- 4. vehicles: restrict SELECT to authenticated users
DROP POLICY IF EXISTS "Anyone can view vehicles" ON public.vehicles;
CREATE POLICY "Authenticated view vehicles"
ON public.vehicles FOR SELECT
TO authenticated
USING (true);

-- 5. trips: restrict SELECT to authenticated users
DROP POLICY IF EXISTS "Anyone can view active trips" ON public.trips;
CREATE POLICY "Authenticated view active trips"
ON public.trips FOR SELECT
TO authenticated
USING (status IN ('boarding','in_transit','scheduled'));

-- 6. routes: only sacco_admins can create
DROP POLICY IF EXISTS "Authenticated can create routes" ON public.routes;
CREATE POLICY "Sacco admins create routes"
ON public.routes FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND public.has_role(auth.uid(), 'sacco_admin'::public.app_role)
);

-- 7. stages: only route creator or sacco owner can add stages
DROP POLICY IF EXISTS "Authenticated add stages" ON public.stages;
CREATE POLICY "Route owners add stages"
ON public.stages FOR INSERT
TO authenticated
WITH CHECK (
  added_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.routes r
    WHERE r.id = route_id
      AND (
        r.created_by = auth.uid()
        OR r.sacco_id IN (SELECT s.id FROM public.saccos s WHERE s.owner_id = auth.uid())
      )
  )
);
