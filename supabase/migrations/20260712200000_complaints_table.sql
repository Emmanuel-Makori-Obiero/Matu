-- ============== COMPLAINTS ==============
-- Backs src/routes/_authenticated/complaints.tsx, which was already inserting
-- into a "complaints" table that never existed as a migration — every
-- complaint submission has been silently failing. This creates the real
-- table matching exactly what that page writes, plus resolution-workflow
-- columns so drivers/SACCOs/platform admins can act on what comes in.
CREATE TYPE public.complaint_category AS ENUM ('app', 'travel');
CREATE TYPE public.complaint_recipient AS ENUM ('developer', 'driver', 'sacco', 'both');
CREATE TYPE public.complaint_status AS ENUM ('open', 'acknowledged', 'resolved');

CREATE TABLE public.complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category public.complaint_category NOT NULL,
  recipient public.complaint_recipient NOT NULL,
  trip_id uuid REFERENCES public.trips(id) ON DELETE SET NULL,
  sacco_id uuid REFERENCES public.saccos(id) ON DELETE SET NULL,
  driver_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  message text NOT NULL,
  status public.complaint_status NOT NULL DEFAULT 'open',
  resolution_note text,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX complaints_passenger_idx ON public.complaints (passenger_id, created_at DESC);
CREATE INDEX complaints_driver_idx ON public.complaints (driver_id) WHERE driver_id IS NOT NULL;
CREATE INDEX complaints_sacco_idx ON public.complaints (sacco_id) WHERE sacco_id IS NOT NULL;
CREATE INDEX complaints_status_idx ON public.complaints (status);

GRANT SELECT, INSERT ON public.complaints TO authenticated;
GRANT ALL ON public.complaints TO service_role;
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;

-- Passengers: submit and see their own.
CREATE POLICY "Passengers insert own complaints" ON public.complaints
  FOR INSERT TO authenticated WITH CHECK (passenger_id = auth.uid());
CREATE POLICY "Passengers view own complaints" ON public.complaints
  FOR SELECT TO authenticated USING (passenger_id = auth.uid());

-- Drivers: see (and later resolve) complaints filed about them.
CREATE POLICY "Drivers view complaints about them" ON public.complaints
  FOR SELECT TO authenticated USING (driver_id = auth.uid());

-- SACCO admins: see complaints tied to a SACCO they own.
CREATE POLICY "Sacco admins view their sacco complaints" ON public.complaints
  FOR SELECT TO authenticated USING (
    sacco_id IN (SELECT id FROM public.saccos WHERE owner_id = auth.uid())
  );

-- Platform admins: full oversight, matching the pattern used elsewhere.
CREATE POLICY "Platform admins view all complaints" ON public.complaints
  FOR SELECT TO authenticated USING (public.is_platform_admin());

-- ============== RESOLUTION RPC ==============
-- Central place to change status, restricted to whoever is actually allowed
-- to act on a given complaint: the driver it's about, the owning SACCO
-- admin, or a platform admin. Direct UPDATEs are intentionally not granted
-- via RLS policy — this function is the only write path so resolved_by is
-- always accurate.
CREATE OR REPLACE FUNCTION public.resolve_complaint(
  _complaint_id uuid,
  _status public.complaint_status,
  _note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _c record;
  _allowed boolean;
BEGIN
  SELECT * INTO _c FROM public.complaints WHERE id = _complaint_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Complaint not found';
  END IF;

  _allowed := public.is_platform_admin()
    OR _c.driver_id = auth.uid()
    OR (
      _c.sacco_id IS NOT NULL
      AND _c.sacco_id IN (SELECT id FROM public.saccos WHERE owner_id = auth.uid())
    );

  IF NOT _allowed THEN
    RAISE EXCEPTION 'Not authorized to resolve this complaint';
  END IF;

  UPDATE public.complaints
  SET status = _status,
      resolution_note = coalesce(_note, resolution_note),
      resolved_by = CASE WHEN _status = 'resolved' THEN auth.uid() ELSE resolved_by END,
      resolved_at = CASE WHEN _status = 'resolved' THEN now() ELSE resolved_at END
  WHERE id = _complaint_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_complaint(uuid, public.complaint_status, text) TO authenticated;
