
-- Sprint C · Migration 016 · cron-curadoria-llm schedule

DO $$ BEGIN
  PERFORM cron.unschedule('cron-curadoria-llm');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'cron-curadoria-llm',
  '0 6 * * *',  -- diário 06:00 UTC
  $cron$
  SELECT net.http_post(
    url := 'https://pdamarjxcmkzbhqxtapl.supabase.co/functions/v1/cron-curadoria-llm?modo=sweep&limite=20',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
    ),
    body := '{}'::jsonb
  )
  $cron$
);

;
