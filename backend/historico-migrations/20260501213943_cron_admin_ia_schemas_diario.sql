-- Cron diário 5h BRT (8h UTC) regenera glossário do schema do banco em chunks
SELECT cron.unschedule('cron-admin-ia-schemas-diario')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cron-admin-ia-schemas-diario');

SELECT cron.schedule(
  'cron-admin-ia-schemas-diario',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://pdamarjxcmkzbhqxtapl.supabase.co/functions/v1/cron-admin-ia-schemas',
    headers := jsonb_build_object('Content-Type', 'application/json')
  );
  $$
);
;
