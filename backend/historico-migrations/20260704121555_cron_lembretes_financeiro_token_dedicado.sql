-- v3: cron manda o segredo dedicado (vault cron_financeiro_token) no header x-cron-token.
SELECT cron.unschedule('lembretes_financeiro_diario')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'lembretes_financeiro_diario');

SELECT cron.schedule(
  'lembretes_financeiro_diario',
  '0 12 * * *',
  $$
    SELECT net.http_post(
      url := 'https://pdamarjxcmkzbhqxtapl.supabase.co/functions/v1/cron-lembretes-financeiro',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-token', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_financeiro_token')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 50000
    );
  $$
);
;
