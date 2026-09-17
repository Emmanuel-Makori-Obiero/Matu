-- ============== FIX: ticket/QR not showing for wallet & manual M-Pesa bookings ==============
-- ride.history.tsx only shows the ticket/QR when a matching public.payments row exists with
-- status 'held' or 'released' (isPaid), in addition to bookings.status being 'confirmed' or
-- 'boarded'. Two payment paths were confirming the booking without ever writing to
-- public.payments, so isPaid stayed false and the ticket never rendered:
--   1. pay_fare_from_wallet() only wrote to wallet_transactions.
--   2. The manual M-Pesa "I sent it" flow updated bookings straight from the client and never
--      touched payments at all.
-- Cash intentionally still writes no payments row — cash isn't verified until the conductor
-- sees it in person, so it correctly gets no ticket.

-- 1) pay_fare_from_wallet: also record the payment so the ticket shows.
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

  -- NEW: record the payment itself, not just the wallet ledger entries, so
  -- ride.history.tsx's isPaid check (which reads public.payments) picks it up.
  INSERT INTO public.payments (booking_id, payer_id, amount, status)
  VALUES (_booking_id, _passenger_id, _fare, 'held');

  UPDATE public.bookings SET status = 'confirmed' WHERE id = _booking_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pay_fare_from_wallet(uuid) TO authenticated;

-- 2) New RPC for the manual/self-declared M-Pesa flow (Pochi / Send Money / Buy Goods paid
-- directly to the driver, outside the app). Mirrors what payWithManualMethod() used to do with
-- a plain bookings.update(), but also writes the payments row payments has no INSERT policy for
-- authenticated users (only SELECT), so the old client-side approach to writing payments would
-- have been rejected by RLS even if it had been attempted -- this has to go through a
-- SECURITY DEFINER function, same pattern as pay_fare_from_wallet.
-- Payment starts 'held', not 'released': the passenger has only self-declared they sent it, the
-- conductor still verifies the M-Pesa SMS in person before boarding.
CREATE OR REPLACE FUNCTION public.confirm_manual_mpesa_payment(_booking_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _fare numeric;
  _passenger_id uuid;
BEGIN
  _passenger_id := auth.uid();
  IF _passenger_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT b.fare_paid INTO _fare
    FROM public.bookings b
    WHERE b.id = _booking_id AND b.passenger_id = auth.uid();

  IF _fare IS NULL THEN
    RAISE EXCEPTION 'Booking not found or does not belong to you';
  END IF;

  INSERT INTO public.payments (booking_id, payer_id, amount, status)
  VALUES (_booking_id, _passenger_id, _fare, 'held');

  UPDATE public.bookings
    SET status = 'confirmed', payment_method = 'mpesa'
    WHERE id = _booking_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_manual_mpesa_payment(uuid) TO authenticated;
