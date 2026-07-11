-- ============== WALLET SYSTEM ==============
-- Adds a shared wallet + ledger design for three owner types:
--   passenger  -> prepaid balance, topped up via M-Pesa STK Push, spent on fares
--   driver     -> credited automatically when a fare they drove is paid, withdrawn via B2C
--   sacco      -> credited with its commission cut per fare, withdrawn via B2C
--
-- Money never moves directly between M-Pesa accounts. All fares/top-ups land in the
-- app's single M-Pesa Paybill/Till. This migration only tracks *internal* balances;
-- actual movement of real money happens via the mpesa-stk-push (in) and
-- mpesa-b2c-payout (out) edge functions.

CREATE TYPE public.wallet_owner_type AS ENUM ('passenger', 'driver', 'sacco');
CREATE TYPE public.wallet_txn_type AS ENUM (
  'topup',            -- passenger wallet funded via STK push
  'fare_payment',      -- passenger wallet debited to pay a fare
  'fare_credit',       -- driver wallet credited from a fare (their cut)
  'sacco_commission',  -- sacco wallet credited from a fare (their cut)
  'withdrawal',        -- driver/sacco wallet debited for a B2C payout
  'refund',            -- money returned to a passenger wallet
  'adjustment'         -- manual correction, service_role only
);
CREATE TYPE public.wallet_txn_status AS ENUM ('pending', 'completed', 'failed', 'reversed');

-- ============== WALLETS ==============
-- One wallet per (owner_type, owner_id). balance is authoritative and only ever
-- changed by the record_wallet_transaction() function below, never updated directly,
-- so it can't drift from the ledger that explains it.
CREATE TABLE public.wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type public.wallet_owner_type NOT NULL,
  owner_id uuid NOT NULL, -- references auth.users(id) for passenger/driver, saccos(id) for sacco
  balance numeric(12,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_type, owner_id)
);
GRANT SELECT ON public.wallets TO authenticated;
GRANT ALL ON public.wallets TO service_role;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

-- Passengers/drivers see their own wallet; sacco owners see their sacco's wallet.
CREATE POLICY "Owner views own wallet" ON public.wallets FOR SELECT TO authenticated
  USING (
    (owner_type IN ('passenger', 'driver') AND owner_id = auth.uid())
    OR (owner_type = 'sacco' AND owner_id IN (SELECT id FROM public.saccos WHERE saccos.owner_id = auth.uid()))
  );

-- ============== WALLET TRANSACTIONS (ledger) ==============
-- Append-only. balance_after is snapshotted at write time so history reads never need
-- to replay the whole ledger to show "what was the balance at the time".
CREATE TABLE public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  type public.wallet_txn_type NOT NULL,
  status public.wallet_txn_status NOT NULL DEFAULT 'pending',
  amount numeric(12,2) NOT NULL, -- always positive; type + sign convention below decides direction
  balance_after numeric(12,2),   -- set once status becomes 'completed'
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  related_wallet_id uuid REFERENCES public.wallets(id) ON DELETE SET NULL, -- the other side of a fare split
  mpesa_checkout_request_id text, -- for topups (STK push)
  mpesa_receipt text,
  mpesa_conversation_id text,     -- for withdrawals (B2C)
  phone text,                     -- destination phone for withdrawals
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_wallet_transactions_wallet_id ON public.wallet_transactions(wallet_id);
CREATE INDEX idx_wallet_transactions_checkout_id ON public.wallet_transactions(mpesa_checkout_request_id);
GRANT SELECT ON public.wallet_transactions TO authenticated;
GRANT ALL ON public.wallet_transactions TO service_role;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner views own wallet transactions" ON public.wallet_transactions FOR SELECT TO authenticated
  USING (
    wallet_id IN (
      SELECT id FROM public.wallets
      WHERE (owner_type IN ('passenger', 'driver') AND owner_id = auth.uid())
         OR (owner_type = 'sacco' AND owner_id IN (SELECT id FROM public.saccos WHERE saccos.owner_id = auth.uid()))
    )
  );

-- ============== FARE SPLIT CONFIG ==============
-- Per-sacco commission rate. Defaults to 10% sacco / 90% driver if a sacco hasn't set
-- its own rate. Kept separate from the saccos table so it can gain more fields
-- (tiered rates, per-route overrides, etc.) later without touching sacco identity data.
CREATE TABLE public.sacco_commission_rates (
  sacco_id uuid PRIMARY KEY REFERENCES public.saccos(id) ON DELETE CASCADE,
  commission_percent numeric(5,2) NOT NULL DEFAULT 10.00 CHECK (commission_percent >= 0 AND commission_percent <= 100),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sacco_commission_rates TO authenticated;
GRANT ALL ON public.sacco_commission_rates TO service_role;
ALTER TABLE public.sacco_commission_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view commission rates" ON public.sacco_commission_rates FOR SELECT USING (true);
CREATE POLICY "Sacco owner sets own commission rate" ON public.sacco_commission_rates FOR ALL TO authenticated
  USING (sacco_id IN (SELECT id FROM public.saccos WHERE owner_id = auth.uid()))
  WITH CHECK (sacco_id IN (SELECT id FROM public.saccos WHERE owner_id = auth.uid()));

-- ============== CORE FUNCTION: apply a completed wallet transaction ==============
-- SECURITY DEFINER so it can update wallets even though wallets has no direct UPDATE
-- policy for authenticated users — all writes must go through here (or through the
-- service-role edge functions) so balance and ledger never disagree.
CREATE OR REPLACE FUNCTION public.get_or_create_wallet(_owner_type public.wallet_owner_type, _owner_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _wallet_id uuid;
BEGIN
  INSERT INTO public.wallets (owner_type, owner_id)
  VALUES (_owner_type, _owner_id)
  ON CONFLICT (owner_type, owner_id) DO NOTHING;

  SELECT id INTO _wallet_id FROM public.wallets WHERE owner_type = _owner_type AND owner_id = _owner_id;
  RETURN _wallet_id;
END;
$$;

-- direction: true = credit (increase balance), false = debit (decrease balance).
-- Debits are blocked by the wallets.balance >= 0 check constraint if funds are insufficient,
-- so callers must catch that and mark the transaction failed rather than assuming success.
CREATE OR REPLACE FUNCTION public.apply_wallet_transaction(
  _wallet_id uuid,
  _type public.wallet_txn_type,
  _amount numeric,
  _direction boolean,
  _booking_id uuid DEFAULT NULL,
  _related_wallet_id uuid DEFAULT NULL,
  _mpesa_checkout_request_id text DEFAULT NULL,
  _mpesa_receipt text DEFAULT NULL,
  _mpesa_conversation_id text DEFAULT NULL,
  _phone text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _txn_id uuid;
  _new_balance numeric;
BEGIN
  IF _direction THEN
    UPDATE public.wallets SET balance = balance + _amount, updated_at = now()
      WHERE id = _wallet_id RETURNING balance INTO _new_balance;
  ELSE
    UPDATE public.wallets SET balance = balance - _amount, updated_at = now()
      WHERE id = _wallet_id RETURNING balance INTO _new_balance;
  END IF;

  INSERT INTO public.wallet_transactions (
    wallet_id, type, status, amount, balance_after, booking_id, related_wallet_id,
    mpesa_checkout_request_id, mpesa_receipt, mpesa_conversation_id, phone
  ) VALUES (
    _wallet_id, _type, 'completed', _amount, _new_balance, _booking_id, _related_wallet_id,
    _mpesa_checkout_request_id, _mpesa_receipt, _mpesa_conversation_id, _phone
  ) RETURNING id INTO _txn_id;

  RETURN _txn_id;
END;
$$;

-- Used specifically when a wallet_transactions row already exists in 'pending' status
-- (e.g. a top-up created when the STK push was initiated) and just needs the balance
-- applied and returned, without inserting a second ledger row the way
-- apply_wallet_transaction() does. Returns the new balance atomically.
CREATE OR REPLACE FUNCTION public.increment_wallet_balance(_wallet_id uuid, _amount numeric)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _new_balance numeric;
BEGIN
  UPDATE public.wallets SET balance = balance + _amount, updated_at = now()
    WHERE id = _wallet_id RETURNING balance INTO _new_balance;
  RETURN _new_balance;
END;
$$;

-- ============== FARE SPLIT: pay a booking from the passenger's wallet ==============
-- Debits the passenger, credits the trip's driver and their sacco in one transaction.
-- Raises (and rolls back everything) if the passenger wallet has insufficient funds,
-- so the caller (edge function) should catch the exception and respond accordingly
-- rather than the frontend assuming the debit always succeeds.
CREATE OR REPLACE FUNCTION public.pay_fare_from_wallet(_booking_id uuid, _passenger_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _fare numeric;
  _driver_id uuid;
  _sacco_id uuid;
  _commission_pct numeric;
  _sacco_cut numeric;
  _driver_cut numeric;
  _passenger_wallet uuid;
  _driver_wallet uuid;
  _sacco_wallet uuid;
BEGIN
  SELECT b.fare_paid, t.driver_id, v.sacco_id
    INTO _fare, _driver_id, _sacco_id
    FROM public.bookings b
    JOIN public.trips t ON t.id = b.trip_id
    JOIN public.vehicles v ON v.id = t.vehicle_id
    WHERE b.id = _booking_id;

  IF _fare IS NULL THEN
    RAISE EXCEPTION 'Booking or fare not found for %', _booking_id;
  END IF;

  SELECT COALESCE(commission_percent, 10.00) INTO _commission_pct
    FROM public.sacco_commission_rates WHERE sacco_id = _sacco_id;
  IF _commission_pct IS NULL THEN _commission_pct := 10.00; END IF;

  _sacco_cut := round(_fare * _commission_pct / 100.0, 2);
  _driver_cut := _fare - _sacco_cut;

  _passenger_wallet := public.get_or_create_wallet('passenger', _passenger_id);
  _driver_wallet := public.get_or_create_wallet('driver', _driver_id);

  -- This raises via the wallets.balance >= 0 check constraint if funds are short.
  PERFORM public.apply_wallet_transaction(_passenger_wallet, 'fare_payment', _fare, false, _booking_id);
  PERFORM public.apply_wallet_transaction(_driver_wallet, 'fare_credit', _driver_cut, true, _booking_id, _passenger_wallet);

  IF _sacco_id IS NOT NULL AND _sacco_cut > 0 THEN
    _sacco_wallet := public.get_or_create_wallet('sacco', _sacco_id);
    PERFORM public.apply_wallet_transaction(_sacco_wallet, 'sacco_commission', _sacco_cut, true, _booking_id, _passenger_wallet);
  END IF;

  UPDATE public.bookings SET status = 'confirmed' WHERE id = _booking_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pay_fare_from_wallet(uuid, uuid) TO authenticated;
