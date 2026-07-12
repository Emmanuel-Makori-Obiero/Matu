-- The "complaints" table, complaint_category enum, complaint_recipient enum,
-- and passenger/driver/sacco-owner RLS policies already exist live in
-- Supabase (created via the dashboard, never committed to a migration).
-- This migration only adds the resolution-workflow pieces that are
-- actually missing: a status column, platform-admin visibility, and the
-- RPC used to change status.

CREATE TYPE public.complaint_status AS ENUM ('open', 'acknowledged', 'resolved');

ALTER TABLE public.complaints
  ADD COLUMN IF NOT EXISTS status public.complaint_status NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS resolution_note text,
  ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

CREATE INDEX IF NOT EXISTS complaints_status_idx ON public.complaints (status);

-- Platform admins: full oversight, additive to the existing
-- passenger/driver/sacco-owner policies (doesn't touch or narrow them).
CREATE POLICY "Platform admins view all complaints" ON public.complaints
  FOR SELECT TO authenticated USING (public.is_platform_admin());

-- ============== RESOLUTION RPC ==============
-- Central place to change status, restricted to whoever is actually allowed
-- to act on a given complaint: the driver it's about, the owning SACCO
-- admin, or a platform admin. Direct UPDATEs to status aren't granted via
-- RLS policy — this function is the only write path so resolved_by is
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
