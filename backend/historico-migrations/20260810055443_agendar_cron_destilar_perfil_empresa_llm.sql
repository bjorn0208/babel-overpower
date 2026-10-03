-- A edge cron-destilar-perfil-empresa-llm (6 campos qualitativos do perfil_empresa)
-- estava deployada mas sem agendamento — perfil ficava com [] pra sempre.
-- Domingo 05:00 UTC (02:00 BRT), 30min após o cron SQL destilar_perfil_empresa (04:30 UTC).
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cron-destilar-perfil-empresa-llm') THEN
    PERFORM cron.unschedule('cron-destilar-perfil-empresa-llm');
  END IF;
END
$do$;

SELECT cron.schedule(
  'cron-destilar-perfil-empresa-llm',
  '0 5 * * 0',
  $cmd$
  SELECT net.http_post(
    url := 'https://pdamarjxcmkzbhqxtapl.supabase.co/functions/v1/cron-destilar-perfil-empresa-llm',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $cmd$
);
;
