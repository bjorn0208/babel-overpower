DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='ragentic_tick') THEN
    PERFORM cron.unschedule('ragentic_tick');
  END IF;
END $$;

SELECT cron.schedule(
  'ragentic_tick',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://pdamarjxcmkzbhqxtapl.supabase.co/functions/v1/ragentic-tick',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 50000
  );
  $cron$
);
;
