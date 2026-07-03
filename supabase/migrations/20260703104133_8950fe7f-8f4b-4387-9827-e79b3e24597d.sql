
-- Allow drivers (and sacco admins) to create routes themselves
DROP POLICY IF EXISTS "Sacco admins create routes" ON public.routes;
CREATE POLICY "Drivers or sacco admins create routes"
ON public.routes FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND (
    public.has_role(auth.uid(), 'sacco_admin')
    OR public.has_role(auth.uid(), 'driver')
    OR public.has_role(auth.uid(), 'conductor')
  )
);
