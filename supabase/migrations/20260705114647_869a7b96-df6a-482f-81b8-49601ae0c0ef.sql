
CREATE TABLE public.driver_join_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sacco_id UUID NOT NULL REFERENCES public.saccos(id) ON DELETE CASCADE,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (driver_id, sacco_id)
);

GRANT SELECT, INSERT, UPDATE ON public.driver_join_requests TO authenticated;
GRANT ALL ON public.driver_join_requests TO service_role;

ALTER TABLE public.driver_join_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers manage their own requests"
  ON public.driver_join_requests FOR ALL
  USING (auth.uid() = driver_id)
  WITH CHECK (auth.uid() = driver_id);

CREATE POLICY "Sacco owners view requests for their sacco"
  ON public.driver_join_requests FOR SELECT
  USING (public.is_sacco_owner(sacco_id));

CREATE POLICY "Sacco owners update requests for their sacco"
  ON public.driver_join_requests FOR UPDATE
  USING (public.is_sacco_owner(sacco_id));

-- Function for a sacco owner to approve a driver request: grants driver role.
CREATE OR REPLACE FUNCTION public.approve_driver_request(_request_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
BEGIN
  SELECT * INTO r FROM public.driver_join_requests WHERE id = _request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'request not found'; END IF;
  IF NOT public.is_sacco_owner(r.sacco_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (r.driver_id, 'driver')
    ON CONFLICT DO NOTHING;
  UPDATE public.driver_join_requests
    SET status = 'approved', updated_at = now()
    WHERE id = _request_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_driver_request(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_driver_request(UUID) TO authenticated;

-- Function to list join requests + profile info for sacco owner
CREATE OR REPLACE FUNCTION public.list_sacco_join_requests(_sacco_id UUID)
RETURNS TABLE (id UUID, driver_id UUID, full_name TEXT, phone TEXT, note TEXT, status TEXT, created_at TIMESTAMPTZ)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.driver_id, p.full_name, p.phone, r.note, r.status, r.created_at
  FROM public.driver_join_requests r
  LEFT JOIN public.profiles p ON p.id = r.driver_id
  WHERE r.sacco_id = _sacco_id
    AND public.is_sacco_owner(_sacco_id)
  ORDER BY r.created_at DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.list_sacco_join_requests(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_sacco_join_requests(UUID) TO authenticated;

-- Public list of saccos for drivers to pick from when requesting to join
CREATE OR REPLACE FUNCTION public.list_public_saccos()
RETURNS TABLE (id UUID, name TEXT)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, name FROM public.saccos ORDER BY name;
$$;

REVOKE EXECUTE ON FUNCTION public.list_public_saccos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_public_saccos() TO authenticated;
