-- Close a gap in the parcel delivery flow: previously an accepted driver could read
-- dropoff_code straight from the parcels row (RLS allowed it since driver_id =
-- auth.uid()), meaning the app-side "ask the receiver for the code" step was purely
-- cosmetic — a driver could just look the code up themselves via the API and never
-- actually meet/verify the receiver. Fix: revoke column-level SELECT on dropoff_code
-- entirely, and only expose/verify it through two narrow SECURITY DEFINER RPCs.

-- 1. No one selects dropoff_code directly anymore, regardless of RLS row access.
REVOKE SELECT ON public.parcels FROM authenticated;
GRANT SELECT (
  id, sender_id, trip_id, driver_id, origin, destination, receiver_name,
  receiver_phone, size, weight_kg, description, price, status,
  created_at, accepted_at, delivered_at
) ON public.parcels TO authenticated;

-- 2. Sender-only lookup, so the person who created the parcel can still see/share
-- the code with their receiver.
CREATE OR REPLACE FUNCTION public.get_parcel_dropoff_code(_parcel_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _code text;
BEGIN
  SELECT dropoff_code INTO _code
  FROM public.parcels
  WHERE id = _parcel_id AND sender_id = auth.uid();

  RETURN _code; -- null if not found or caller isn't the sender; reveals nothing either way
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_parcel_dropoff_code(uuid) TO authenticated;

-- 3. The only way a parcel can be marked delivered: the assigned driver supplies a
-- code, and it's checked against the stored value inside this function — the caller
-- never gets to read dropoff_code to compare it themselves.
CREATE OR REPLACE FUNCTION public.confirm_parcel_delivery(_parcel_id uuid, _code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _rows int;
BEGIN
  UPDATE public.parcels
  SET status = 'delivered', delivered_at = now()
  WHERE id = _parcel_id
    AND driver_id = auth.uid()
    AND dropoff_code = _code
    AND status IN ('accepted', 'in_transit');

  GET DIAGNOSTICS _rows = ROW_COUNT;
  RETURN _rows > 0;
END;
$$;
GRANT EXECUTE ON FUNCTION public.confirm_parcel_delivery(uuid, text) TO authenticated;
