-- Matu: role separation, driver registration types, SACCO subscriptions, payment errors
-- Save as: supabase/migrations/20260708120000_matu_phase1.sql
 
-- ============== DRIVER TYPE + KYC FIELDS ==============
CREATE TYPE public.driver_type AS ENUM ('sacco_driver', 'independent');
 
ALTER TABLE public.profiles
  ADD COLUMN id_number text,
  ADD COLUMN license_number text,
  ADD COLUMN driver_type public.driver_type;
 
-- ============== SACCO JOIN REQUESTS ==============
CREATE TYPE public.join_request_status AS ENUM ('pending', 'approved', 'rejected');
 
CREATE TABLE public.sacco_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sacco_id uuid NOT NULL REFERENCES public.saccos(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  phone text NOT NULL,
  id_number text NOT NULL,
  license_number text NOT NULL,
  brings_own_vehicle boolean NOT NULL DEFAULT false,
  vehicle_plate text,
  status public.join_request_status NOT NULL DEFAULT 'pending',
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(sacco_id, driver_id)
);
GRANT SELECT, INSERT, UPDATE ON public.sacco_join_requests TO authenticated;
GRANT ALL ON public.sacco_join_requests TO service_role;
ALTER TABLE public.sacco_join_requests ENABLE ROW LEVEL SECURITY;
 
CREATE POLICY "Driver views own requests" ON public.sacco_join_requests
  FOR SELECT TO authenticated USING (driver_id = auth.uid());
CREATE POLICY "Sacco owner views requests to their sacco" ON public.sacco_join_requests
  FOR SELECT TO authenticated
  USING (sacco_id IN (SELECT id FROM public.saccos WHERE owner_id = auth.uid()));
CREATE POLICY "Driver creates own request" ON public.sacco_join_requests
  FOR INSERT TO authenticated WITH CHECK (driver_id = auth.uid());
CREATE POLICY "Sacco owner updates requests" ON public.sacco_join_requests
  FOR UPDATE TO authenticated
  USING (sacco_id IN (SELECT id FROM public.saccos WHERE owner_id = auth.uid()));
 
-- When a sacco owner approves a request, attach the driver (and their vehicle, if any) to the sacco.
CREATE OR REPLACE FUNCTION public.approve_join_request(_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.sacco_join_requests;
BEGIN
  SELECT * INTO r FROM public.sacco_join_requests WHERE id = _request_id;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.saccos WHERE id = r.sacco_id AND owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
 
  UPDATE public.sacco_join_requests SET status = 'approved', reviewed_at = now() WHERE id = _request_id;
 
  UPDATE public.profiles
    SET id_number = COALESCE(id_number, r.id_number),
        license_number = COALESCE(license_number, r.license_number)
    WHERE id = r.driver_id;
 
  INSERT INTO public.user_roles (user_id, role) VALUES (r.driver_id, 'driver')
    ON CONFLICT DO NOTHING;
 
  IF r.brings_own_vehicle AND r.vehicle_plate IS NOT NULL THEN
    UPDATE public.vehicles SET sacco_id = r.sacco_id
      WHERE plate_number = r.vehicle_plate AND driver_id = r.driver_id;
  END IF;
END;
$$;
 
-- ============== SACCO SUBSCRIPTIONS ==============
CREATE TYPE public.subscription_status AS ENUM ('pending', 'active', 'past_due', 'failed');
 
-- Ksh 300 per registered vehicle per month, minimum Ksh 500. Adjust freely.
CREATE OR REPLACE FUNCTION public.calculate_subscription_fee(_vehicle_count int)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT GREATEST(500, _vehicle_count * 300)::numeric
$$;
 
CREATE TABLE public.sacco_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sacco_id uuid NOT NULL REFERENCES public.saccos(id) ON DELETE CASCADE,
  vehicle_count int NOT NULL,
  amount numeric(10,2) NOT NULL,
  status public.subscription_status NOT NULL DEFAULT 'pending',
  mpesa_checkout_request_id text,
  mpesa_receipt text,
  failure_reason text,
  period_start date NOT NULL DEFAULT current_date,
  period_end date NOT NULL DEFAULT (current_date + interval '30 days'),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.sacco_subscriptions TO authenticated;
GRANT ALL ON public.sacco_subscriptions TO service_role;
ALTER TABLE public.sacco_subscriptions ENABLE ROW LEVEL SECURITY;
 
CREATE POLICY "Sacco owner views own subscriptions" ON public.sacco_subscriptions
  FOR SELECT TO authenticated
  USING (sacco_id IN (SELECT id FROM public.saccos WHERE owner_id = auth.uid()));
CREATE POLICY "Sacco owner creates own subscription" ON public.sacco_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (sacco_id IN (SELECT id FROM public.saccos WHERE owner_id = auth.uid()));
 
ALTER PUBLICATION supabase_realtime ADD TABLE public.sacco_subscriptions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sacco_join_requests;
 
-- ============== PAYMENT FAILURE HANDLING ==============
ALTER TABLE public.payments
  ADD COLUMN failure_reason text,
  ADD COLUMN mpesa_checkout_request_id text;
 
-- ============== STAGE GPS BROADCAST HELPER ==============
-- Lets a driver update their live position + selected stage in one call, respecting RLS.
CREATE OR REPLACE FUNCTION public.update_trip_position(
  _trip_id uuid, _lat double precision, _lng double precision, _stage_id uuid
) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.trips
    SET current_lat = _lat, current_lng = _lng, current_stage_id = _stage_id
    WHERE id = _trip_id AND driver_id = auth.uid();
$$;
