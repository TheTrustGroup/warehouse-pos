-- Schedule low-stock-alert Edge Function daily at 8:00 AM UTC (NEXT 2).
-- Requires: pg_net extension enabled (Dashboard → Database → Extensions → pg_net).
-- Requires: Vault secrets so the job can call the function:
--   - project_url: your Supabase project URL (e.g. https://xxxx.supabase.co)
--   - anon_key or service_role_key: for Authorization header when invoking the function
-- Create secrets in Dashboard → Project Settings → Vault (or SQL: select vault.create_secret('https://xxx.supabase.co', 'project_url'); etc.)
-- If you prefer not to use pg_net, use Dashboard → Edge Functions → low-stock-alert → Add Cron Trigger with schedule "0 8 * * *".

CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'low-stock-alert-8am') THEN
    PERFORM cron.unschedule('low-stock-alert-8am');
  END IF;
END
$$;

-- Invoke Edge Function at 8am UTC. Uses Vault: project_url, and cron_secret (same value as Edge Function secret CRON_SECRET).
-- If CRON_SECRET is not set on the function, leave cron_secret empty and use service_role_key in Vault for Authorization.
-- See docs/NEXT2_LOW_STOCK_ALERT.md.
SELECT cron.schedule(
  'low-stock-alert-8am',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/low-stock-alert',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret'),
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key'),
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'anon_key')
      )
    )
  ) AS request_id;
  $$
);
