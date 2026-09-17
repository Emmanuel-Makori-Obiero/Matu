-- Schedules the mpesa-stk-reconcile edge function to run every minute, sweeping
-- any STK push whose callback never arrived and resolving it via Safaricom's
-- STK Push Query API instead of leaving it stuck at 'pending' forever.
--
-- The shared secret this calls with lives in Vault (name: 'mpesa_reconcile_secret'),
-- never in this migration file or in git — set once via:
--   select vault.create_secret('<random value>', 'mpesa_reconcile_secret', '...');
-- and the SAME value must be set as the MPESA_RECONCILE_SECRET edge function secret.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- SECURITY DEFINER so cron (running as postgres) can read the vault secret and
-- fire the HTTP call regardless of who owns the cron job row.
CREATE OR REPLACE FUNCTION public.trigger_mpesa_reconcile()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  _secret text;
  _project_url text := 'https://gxipeqjcqarzfddenpkt.supabase.co';
BEGIN
  SELECT decrypted_secret INTO _secret
  FROM vault.decrypted_secrets
  WHERE name = 'mpesa_reconcile_secret'
  LIMIT 1;

  IF _secret IS NULL THEN
    RAISE WARNING 'trigger_mpesa_reconcile: mpesa_reconcile_secret not set in vault, skipping';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := _project_url || '/functions/v1/mpesa-stk-reconcile?secret=' || _secret,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
END;
$$;

SELECT cron.schedule(
  'mpesa-stk-reconcile',
  '* * * * *',
  $$SELECT public.trigger_mpesa_reconcile();$$
);
