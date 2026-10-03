-- Retenção do histórico do pg_cron: `cron.job_run_details` cresce sem limite
-- (48 jobs, 4 deles a cada 1–2 min → 270 MB de bloat) e vira peso morto de IO
-- na máquina pequena. Job diário mantém 3 dias (prática padrão Supabase).
-- Down: cron.unschedule('limpar_historico_cron').
SELECT cron.unschedule('limpar_historico_cron')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'limpar_historico_cron');

SELECT cron.schedule(
  'limpar_historico_cron',
  '0 6 * * *',
  $$DELETE FROM cron.job_run_details WHERE end_time < now() - interval '3 days'$$
);
;
