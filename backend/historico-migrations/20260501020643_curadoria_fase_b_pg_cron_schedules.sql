-- Schedule cron-cluster-gaps a cada 6h e cron-canary-monitor a cada 1h
-- Idempotente · unschedule antes de schedule pra reaplicar sem erro.

DO $$
BEGIN
  PERFORM cron.unschedule('curadoria-cluster-gaps');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('curadoria-canary-monitor');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'curadoria-cluster-gaps',
  '0 */6 * * *',
  $cmd$
    SELECT net.http_post(
      url := 'https://pdamarjxcmkzbhqxtapl.supabase.co/functions/v1/cron-cluster-gaps',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 300000
    ) AS request_id;
  $cmd$
);

SELECT cron.schedule(
  'curadoria-canary-monitor',
  '0 * * * *',
  $cmd$
    SELECT net.http_post(
      url := 'https://pdamarjxcmkzbhqxtapl.supabase.co/functions/v1/cron-canary-monitor',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 300000
    ) AS request_id;
  $cmd$
);

;
