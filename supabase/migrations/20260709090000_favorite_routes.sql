CREATE TABLE public.favorite_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  route_id uuid NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (passenger_id, route_id)
);

GRANT SELECT, INSERT, DELETE ON public.favorite_routes TO authenticated;
GRANT ALL ON public.favorite_routes TO service_role;
ALTER TABLE public.favorite_routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Passenger manages own favorite routes"
  ON public.favorite_routes FOR ALL TO authenticated
  USING (passenger_id = auth.uid())
  WITH CHECK (passenger_id = auth.uid());
