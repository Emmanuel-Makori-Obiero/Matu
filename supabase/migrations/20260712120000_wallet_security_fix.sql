-- ============== SECURITY FIX: wallet function privilege escalation ==============
-- apply_wallet_transaction, increment_wallet_balance, and get_or_create_wallet were
-- left executable by any authenticated user (Postgres's default grant to PUBLIC on
-- new functions). apply_wallet_transaction/increment_wallet_balance let any signed-in
-- user credit/debit ANY wallet by ID for any amount — effectively a free-money bug.
-- pay_fare_from_wallet took _passenger_id as a caller-supplied parameter instead of
-- deriving it from auth.uid(), so any user could drain another passenger's wallet by
-- passing their ID. This migration revokes public access to the raw functions and
-- fixes pay_fare_from_wallet to only ever act on the caller's own identity.

REVOKE EXECUTE ON FUNCTION public.apply_wallet_transaction(
  uuid, public.wallet_txn_type, numeric, boolean, uuid, uuid, text, text, text, text
) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.apply_wallet_transaction(
  uuid, public.wallet_txn_type, numeric, boolean, uuid, uuid, text, text, text, text
) TO service_role;

REVOKE EXECUTE ON FUNCTION public.increment_wallet_balance(uuid, numeric) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.increment_wallet_balance(uuid, numeric) TO service_role;

-- get_or_create_wallet took an arbitrary owner_type/owner_id — an authenticated user
-- could call it with someone ELSE's owner_id to pre-create wallet rows for them (not
-- itself a way to move money, but there's no reason to allow it and it's a needless
-- surface). Replaced by get_or_create_my_wallet() below, which the frontend should use
-- instead — it always resolves the owner_id from auth.uid() (or the sacco the caller
-- owns), never from a client-supplied value.
REVOKE EXECUTE ON FUNCTION public.get_or_create_wallet(public.wallet_owner_type, uuid) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_wallet(public.wallet_owner_type, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_or_create_my_wallet(_owner_type public.wallet_owner_type)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _owner_id uuid;
BEGIN
  IF _owner_type IN ('passenger', 'driver') THEN
    _owner_id := auth.uid();
  ELSIF _owner_type = 'sacco' THEN
    SELECT id INTO _owner_id FROM public.saccos WHERE owner_id = auth.uid() LIMIT 1;
    IF _owner_id IS NULL THEN
      RAISE EXCEPTION 'You do not own a SACCO';
    END IF;
  END IF;

  RETURN public.get_or_create_wallet(_owner_type, _owner_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_or_create_my_wallet(public.wallet_owner_type) TO authenticated;

-- Fix pay_fare_from_wallet: derive the passenger from auth.uid() instead of trusting a
-- caller-supplied _passenger_id, and confirm the booking actually belongs to them.
CREATE OR REPLACE FUNCTION public.pay_fare_from_wallet(_booking_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _fare numeric;
  _driver_id uuid;
  _sacco_id uuid;
  _passenger_id uuid;
  _commission_pct numeric;
  _sacco_cut numeric;
  _driver_cut numeric;
  _passenger_wallet uuid;
  _driver_wallet uuid;
  _sacco_wallet uuid;
BEGIN
  _passenger_id := auth.uid();
  IF _passenger_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT b.fare_paid, t.driver_id, v.sacco_id, b.passenger_id
    INTO _fare, _driver_id, _sacco_id, _passenger_id
    FROM public.bookings b
    JOIN public.trips t ON t.id = b.trip_id
    JOIN public.vehicles v ON v.id = t.vehicle_id
    WHERE b.id = _booking_id AND b.passenger_id = auth.uid();

  IF _fare IS NULL THEN
    RAISE EXCEPTION 'Booking not found or does not belong to you';
  END IF;

  SELECT COALESCE(commission_percent, 10.00) INTO _commission_pct
    FROM public.sacco_commission_rates WHERE sacco_id = _sacco_id;
  IF _commission_pct IS NULL THEN _commission_pct := 10.00; END IF;

  _sacco_cut := round(_fare * _commission_pct / 100.0, 2);
  _driver_cut := _fare - _sacco_cut;

  _passenger_wallet := public.get_or_create_wallet('passenger', _passenger_id);
  _driver_wallet := public.get_or_create_wallet('driver', _driver_id);

  PERFORM public.apply_wallet_transaction(_passenger_wallet, 'fare_payment', _fare, false, _booking_id);
  PERFORM public.apply_wallet_transaction(_driver_wallet, 'fare_credit', _driver_cut, true, _booking_id, _passenger_wallet);

  IF _sacco_id IS NOT NULL AND _sacco_cut > 0 THEN
    _sacco_wallet := public.get_or_create_wallet('sacco', _sacco_id);
    PERFORM public.apply_wallet_transaction(_sacco_wallet, 'sacco_commission', _sacco_cut, true, _booking_id, _passenger_wallet);
  END IF;

  UPDATE public.bookings SET status = 'confirmed' WHERE id = _booking_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pay_fare_from_wallet(uuid, uuid) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.pay_fare_from_wallet(uuid) TO authenticated;
