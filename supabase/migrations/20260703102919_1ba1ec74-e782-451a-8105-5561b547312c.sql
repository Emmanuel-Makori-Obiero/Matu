CREATE POLICY "Sacco owner updates fleet trips" ON public.trips
FOR UPDATE TO authenticated
USING (vehicle_id IN (SELECT v.id FROM public.vehicles v JOIN public.saccos s ON s.id = v.sacco_id WHERE s.owner_id = auth.uid()))
WITH CHECK (vehicle_id IN (SELECT v.id FROM public.vehicles v JOIN public.saccos s ON s.id = v.sacco_id WHERE s.owner_id = auth.uid()));