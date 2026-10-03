-- Otimizar vw_cron_saude — agregar 1x em vez de 5 subqueries
DROP VIEW IF EXISTS public.vw_cron_saude CASCADE;

CREATE VIEW public.vw_cron_saude
WITH (security_invoker = true) AS
WITH stats AS (
  SELECT
    d.jobid,
    MAX(d.start_time) AS ultima_exec,
    count(*) FILTER (WHERE d.status = 'failed') AS falhas_7d,
    count(*) FILTER (WHERE d.status = 'succeeded') AS sucessos_7d,
    ROUND(AVG(EXTRACT(EPOCH FROM (d.end_time - d.start_time)) * 1000)
          FILTER (WHERE d.end_time IS NOT NULL)::numeric, 0) AS duracao_media_ms
  FROM cron.job_run_details d
  WHERE d.start_time > now() - interval '7 days'
  GROUP BY d.jobid
),
ultima AS (
  SELECT DISTINCT ON (jobid) jobid, status AS status_ultima
  FROM cron.job_run_details
  WHERE start_time > now() - interval '7 days'
  ORDER BY jobid, start_time DESC
)
SELECT
  j.jobid,
  j.jobname,
  j.schedule,
  j.active,
  s.ultima_exec,
  COALESCE(s.falhas_7d, 0) AS falhas_7d,
  COALESCE(s.sucessos_7d, 0) AS sucessos_7d,
  s.duracao_media_ms,
  u.status_ultima
FROM cron.job j
LEFT JOIN stats s ON s.jobid = j.jobid
LEFT JOIN ultima u ON u.jobid = j.jobid;

GRANT SELECT ON public.vw_cron_saude TO authenticated;

-- Recriar listar_jobs_com_historico (CASCADE dropou)
CREATE OR REPLACE FUNCTION public.listar_jobs_com_historico()
RETURNS TABLE (
  nome text, descricao text, categoria text, cron_expr text, ativo boolean,
  jobid_pg_cron integer, ultima_exec timestamptz, status_ultima text,
  falhas_7d bigint, sucessos_7d bigint, duracao_media_ms numeric
)
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $func$
  SELECT ac.nome, ac.descricao, ac.categoria, ac.cron_expr, ac.ativo,
         ac.jobid_pg_cron, s.ultima_exec, s.status_ultima,
         COALESCE(s.falhas_7d, 0), COALESCE(s.sucessos_7d, 0), s.duracao_media_ms
  FROM public.agendamentos_config ac
  LEFT JOIN public.vw_cron_saude s ON s.jobid = ac.jobid_pg_cron
  ORDER BY ac.categoria, ac.nome;
$func$;

GRANT EXECUTE ON FUNCTION public.listar_jobs_com_historico TO authenticated;

;
