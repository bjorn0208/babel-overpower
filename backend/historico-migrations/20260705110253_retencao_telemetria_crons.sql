-- Retenção de telemetria interna (análise de escala 2026-07-05): ~1 GB do banco
-- era log sem faxina. Réguas seguindo precedente da plataforma:
-- job_run_details 7d (recomendação pg_cron) · traces 90d · prompts_mensagem 90d
-- (tabela legada — parou de receber em 2026-05-12; esvazia sozinha pela régua).

SET lock_timeout = '4s';
SET statement_timeout = '60s';

SELECT cron.unschedule('limpar-job-run-details')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'limpar-job-run-details');

SELECT cron.schedule(
  'limpar-job-run-details',
  '30 3 * * *',
  $$DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days'$$
);

SELECT cron.unschedule('limpar-traces')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'limpar-traces');

SELECT cron.schedule(
  'limpar-traces',
  '40 3 * * *',
  $$DELETE FROM public.traces WHERE criado_em < now() - interval '90 days'$$
);

SELECT cron.unschedule('limpar-prompts-mensagem')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'limpar-prompts-mensagem');

SELECT cron.schedule(
  'limpar-prompts-mensagem',
  '50 3 * * *',
  $$DELETE FROM public.prompts_mensagem WHERE created_at < now() - interval '90 days'$$
);
;
