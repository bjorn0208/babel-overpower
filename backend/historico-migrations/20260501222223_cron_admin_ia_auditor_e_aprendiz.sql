-- Sprint 3 admin-ia · agendar auditor noturno + aprendiz semanal

-- Auditor noturno · todo dia 6h UTC (3h BRT)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cron-admin-ia-auditor-noturno') THEN
    PERFORM cron.unschedule('cron-admin-ia-auditor-noturno');
  END IF;
END $$;

SELECT cron.schedule(
  'cron-admin-ia-auditor-noturno',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://pdamarjxcmkzbhqxtapl.supabase.co/functions/v1/cron-admin-ia-auditor-noturno',
    headers := jsonb_build_object('Content-Type', 'application/json')
  );
  $$
);

-- Aprendiz semanal · segunda 10h UTC (7h BRT)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cron-admin-ia-aprendiz-semanal') THEN
    PERFORM cron.unschedule('cron-admin-ia-aprendiz-semanal');
  END IF;
END $$;

SELECT cron.schedule(
  'cron-admin-ia-aprendiz-semanal',
  '0 10 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://pdamarjxcmkzbhqxtapl.supabase.co/functions/v1/cron-admin-ia-aprendiz',
    headers := jsonb_build_object('Content-Type', 'application/json')
  );
  $$
);
;
