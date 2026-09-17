-- ============== Restrict ticket/QR to wallet payments only ==============
-- Passenger asked for the ticket/QR to show only when a booking was paid via wallet, not
-- M-Pesa (manual self-declared, or a real STK push). payments had no column distinguishing
-- *how* a payment was made, so this adds one and backfills existing rows, then updates the
-- writers to set it correctly. ride.history.tsx is updated separately to require method =
-- 'wallet' before showing the ticket.

ALTER TABLE public.payments
  ADD COLUMN method text NOT NULL DEFAULT 'mpesa' CHECK (method IN ('wallet', 'mpesa'));

-- Backfill: any existing row with no M-Pesa identifiers at all was inserted by the old
-- (pre-fix) confirm_manual_mpesa_payment, so leaving it as the 'mpesa' default is correct.
-- Rows with a checkout id or receipt are definitely M-Pesa too, so the blanket default
-- already covers every pre-existing row correctly; nothing pre-existing should be 'wallet'
-- since pay_fare_from_wallet only started writing to payments in the migration right before
-- this one.

-- pay_fare_from_wallet: tag the payment as 'wallet'.
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

  INSERT INTO public.payments (booking_id, payer_id, amount, status, method)
  VALUES (_booking_id, _passenger_id, _fare, 'held', 'wallet');

  UPDATE public.bookings SET status = 'confirmed' WHERE id = _booking_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pay_fare_from_wallet(uuid) TO authenticated;

-- confirm_manual_mpesa_payment: unchanged behaviour, just explicit about method = 'mpesa'
-- (same as the column default, spelled out for clarity).
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

  INSERT INTO public.payments (booking_id, payer_id, amount, status, method)
  VALUES (_booking_id, _passenger_id, _fare, 'held', 'mpesa');

  UPDATE public.bookings
    SET status = 'confirmed', payment_method = 'mpesa'
    WHERE id = _booking_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_manual_mpesa_payment(uuid) TO authenticated;
