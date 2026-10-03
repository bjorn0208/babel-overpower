-- Lembretes de contas a pagar: 1×/dia às 12:00 UTC (09:00 BRT).
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
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 50000
    );
  $$
);
;
