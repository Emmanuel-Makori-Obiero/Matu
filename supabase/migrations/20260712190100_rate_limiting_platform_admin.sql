-- ============== RATE LIMITING ==============
-- Generic sliding-window hit counter. Any RPC/trigger can call
-- check_rate_limit(action, max_count, window_seconds) to ask "is this
-- user allowed to do <action> again right now?" and it both checks and
-- records the attempt atomically.
CREATE TABLE public.rate_limit_hits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rate_limit_hits_user_action_time_idx
  ON public.rate_limit_hits (user_id, action, created_at DESC);

-- Keep the table from growing forever: drop hits older than 1 day
-- opportunistically whenever a check runs.
GRANT SELECT ON public.rate_limit_hits TO authenticated;
GRANT ALL ON public.rate_limit_hits TO service_role;
ALTER TABLE public.rate_limit_hits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own rate limit hits" ON public.rate_limit_hits
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  _action text,
  _max_count integer,
  _window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _recent_count integer;
BEGIN
  IF _uid IS NULL THEN
    RETURN false;
  END IF;

  DELETE FROM public.rate_limit_hits
  WHERE created_at < now() - interval '1 day';

  SELECT count(*) INTO _recent_count
  FROM public.rate_limit_hits
  WHERE user_id = _uid
    AND action = _action
    AND created_at > now() - make_interval(secs => _window_seconds);

  IF _recent_count >= _max_count THEN
    RETURN false;
  END IF;

  INSERT INTO public.rate_limit_hits (user_id, action) VALUES (_uid, _action);
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO authenticated;

-- ============== PLATFORM ADMIN ==============
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'platform_admin')
$$;

GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;

-- Additive, platform-wide read access for platform_admin across the
-- tables that matter for cross-SACCO oversight. These are extra
-- permissive policies layered on top of existing ones (Postgres OR's
-- multiple permissive policies together), so nothing already granted
-- is narrowed.
CREATE POLICY "Platform admins view all saccos" ON public.saccos
  FOR SELECT TO authenticated USING (public.is_platform_admin());
CREATE POLICY "Platform admins view all vehicles" ON public.vehicles
  FOR SELECT TO authenticated USING (public.is_platform_admin());
CREATE POLICY "Platform admins view all routes" ON public.routes
  FOR SELECT TO authenticated USING (public.is_platform_admin());
CREATE POLICY "Platform admins view all trips" ON public.trips
  FOR SELECT TO authenticated USING (public.is_platform_admin());
CREATE POLICY "Platform admins view all bookings" ON public.bookings
  FOR SELECT TO authenticated USING (public.is_platform_admin());
CREATE POLICY "Platform admins view all driver join requests" ON public.driver_join_requests
  FOR SELECT TO authenticated USING (public.is_platform_admin());
CREATE POLICY "Platform admins view all alerts" ON public.alerts
  FOR SELECT TO authenticated USING (public.is_platform_admin());
CREATE POLICY "Platform admins update any vehicle" ON public.vehicles
  FOR UPDATE TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
CREATE POLICY "Platform admins update any sacco" ON public.saccos
  FOR UPDATE TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

-- Convenience RPC for the admin dashboard to suspend a vehicle
-- platform-wide (e.g. after a safety complaint), independent of which
-- SACCO owns it.
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS suspended boolean NOT NULL DEFAULT false;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS suspended_reason text;

CREATE OR REPLACE FUNCTION public.vehicle_is_suspended(_vehicle_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(suspended, false) FROM public.vehicles WHERE id = _vehicle_id
$$;

GRANT EXECUTE ON FUNCTION public.vehicle_is_suspended(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_vehicle_suspension(
  _vehicle_id uuid,
  _suspended boolean,
  _reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Only platform admins can change vehicle suspension';
  END IF;

  UPDATE public.vehicles
  SET suspended = _suspended,
      suspended_reason = CASE WHEN _suspended THEN _reason ELSE NULL END
  WHERE id = _vehicle_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_vehicle_suspension(uuid, boolean, text) TO authenticated;

-- ============== RATE-LIMIT THE ALERTS TABLE ==============
-- Passenger "I'm near pickup" / "let me off" alerts are a direct table
-- insert from the frontend, not an RPC, so enforce the limit with a
-- trigger: at most 10 alerts per user per 5 minutes.
CREATE OR REPLACE FUNCTION public.enforce_alerts_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.check_rate_limit('send_alert', 10, 300) THEN
    RAISE EXCEPTION 'Too many alerts sent — please wait a few minutes and try again';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS alerts_rate_limit ON public.alerts;
CREATE TRIGGER alerts_rate_limit
  BEFORE INSERT ON public.alerts
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_alerts_rate_limit();
