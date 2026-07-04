CREATE OR REPLACE FUNCTION public.get_my_sacco_dashboard()
RETURNS TABLE(
  sacco_id uuid,
  vehicle_count bigint,
  driver_count bigint,
  route_count bigint,
  live_trip_count bigint,
  today_trip_count bigint,
  revenue_today numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id AS sacco_id,
    (SELECT count(*) FROM public.vehicles v WHERE v.sacco_id = s.id) AS vehicle_count,
    (SELECT count(DISTINCT v.driver_id) FROM public.vehicles v WHERE v.sacco_id = s.id AND v.driver_id IS NOT NULL) AS driver_count,
    (SELECT count(*) FROM public.routes r WHERE r.sacco_id = s.id) AS route_count,
    (
      SELECT count(*)
      FROM public.trips t
      JOIN public.vehicles v ON v.id = t.vehicle_id
      WHERE v.sacco_id = s.id AND t.status IN ('boarding', 'in_transit')
    ) AS live_trip_count,
    (
      SELECT count(*)
      FROM public.trips t
      JOIN public.vehicles v ON v.id = t.vehicle_id
      WHERE v.sacco_id = s.id AND t.created_at >= date_trunc('day', now())
    ) AS today_trip_count,
    COALESCE((
      SELECT sum(t.fare)
      FROM public.trips t
      JOIN public.vehicles v ON v.id = t.vehicle_id
      WHERE v.sacco_id = s.id
        AND t.created_at >= date_trunc('day', now())
        AND t.status IN ('boarding', 'in_transit', 'completed')
    ), 0)::numeric AS revenue_today
  FROM public.saccos s
  WHERE s.owner_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_my_sacco_dashboard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_sacco_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_sacco_dashboard() TO service_role;

CREATE OR REPLACE FUNCTION public.get_my_sacco_drivers(_sacco_id uuid)
RETURNS TABLE(
  driver_id uuid,
  full_name text,
  phone text,
  vehicle_id uuid,
  plate_number text,
  status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.saccos s WHERE s.id = _sacco_id AND s.owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  RETURN QUERY
  SELECT
    p.id AS driver_id,
    p.full_name,
    p.phone,
    v.id AS vehicle_id,
    v.plate_number,
    CASE
      WHEN v.driver_id IS NULL THEN 'unassigned'
      WHEN EXISTS (
        SELECT 1 FROM public.trips t
        WHERE t.vehicle_id = v.id
          AND t.driver_id = v.driver_id
          AND t.status IN ('boarding', 'in_transit')
      ) THEN 'on-trip'
      ELSE 'assigned'
    END AS status
  FROM public.vehicles v
  LEFT JOIN public.profiles p ON p.id = v.driver_id
  WHERE v.sacco_id = _sacco_id
  ORDER BY v.plate_number;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_sacco_drivers(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_sacco_drivers(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_sacco_drivers(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.assign_sacco_driver(_vehicle_id uuid, _phone text)
RETURNS TABLE(driver_id uuid, full_name text, phone text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner_ok boolean;
  _driver public.profiles%ROWTYPE;
  _digits text := regexp_replace(coalesce(_phone, ''), '\D', '', 'g');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.vehicles v
    JOIN public.saccos s ON s.id = v.sacco_id
    WHERE v.id = _vehicle_id AND s.owner_id = auth.uid()
  ) INTO _owner_ok;

  IF NOT _owner_ok THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  SELECT p.* INTO _driver
  FROM public.profiles p
  WHERE p.phone = trim(_phone)
     OR regexp_replace(coalesce(p.phone, ''), '\D', '', 'g') = _digits
  ORDER BY p.created_at DESC
  LIMIT 1;

  IF _driver.id IS NULL THEN
    RAISE EXCEPTION 'No registered user found with that phone number';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_driver.id, 'driver')
  ON CONFLICT DO NOTHING;

  UPDATE public.vehicles
  SET driver_id = _driver.id
  WHERE id = _vehicle_id;

  RETURN QUERY SELECT _driver.id, _driver.full_name, _driver.phone;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_sacco_driver(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_sacco_driver(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_sacco_driver(uuid, text) TO service_role;