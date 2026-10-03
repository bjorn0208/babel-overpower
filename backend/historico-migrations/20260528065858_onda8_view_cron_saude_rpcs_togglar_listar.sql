-- ============================================================================
-- Onda 8 — Painel Crons honesto
-- View vw_cron_saude (agregado 7d) + RPC listar_jobs_com_historico + RPC togglar_job
-- ============================================================================

-- 1) View: agregado 7d sobre cron.job_run_details
CREATE OR REPLACE VIEW public.vw_cron_saude
WITH (security_invoker = true) AS
SELECT
  j.jobid,
  j.jobname,
  j.schedule,
  j.active,
  (SELECT MAX(d.start_time) FROM cron.job_run_details d WHERE d.jobid = j.jobid) AS ultima_exec,
  (SELECT count(*) FROM cron.job_run_details d 
   WHERE d.jobid = j.jobid 
     AND d.start_time > now() - interval '7 days'
     AND d.status = 'failed') AS falhas_7d,
  (SELECT count(*) FROM cron.job_run_details d 
   WHERE d.jobid = j.jobid 
     AND d.start_time > now() - interval '7 days'
     AND d.status = 'succeeded') AS sucessos_7d,
  (SELECT ROUND(AVG(EXTRACT(EPOCH FROM (d.end_time - d.start_time)) * 1000)::numeric, 0)
   FROM cron.job_run_details d 
   WHERE d.jobid = j.jobid 
     AND d.start_time > now() - interval '7 days'
     AND d.end_time IS NOT NULL) AS duracao_media_ms,
  (SELECT d.status FROM cron.job_run_details d 
   WHERE d.jobid = j.jobid 
   ORDER BY d.start_time DESC LIMIT 1) AS status_ultima
FROM cron.job j;

GRANT SELECT ON public.vw_cron_saude TO authenticated;

-- 2) RPC: listar todos os jobs (UNION agendamentos_config + métricas reais)
CREATE OR REPLACE FUNCTION public.listar_jobs_com_historico()
RETURNS TABLE (
  nome text,
  descricao text,
  categoria text,
  cron_expr text,
  ativo boolean,
  jobid_pg_cron integer,
  ultima_exec timestamptz,
  status_ultima text,
  falhas_7d bigint,
  sucessos_7d bigint,
  duracao_media_ms numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $func$
  SELECT 
    ac.nome,
    ac.descricao,
    ac.categoria,
    ac.cron_expr,
    ac.ativo,
    ac.jobid_pg_cron,
    s.ultima_exec,
    s.status_ultima,
    COALESCE(s.falhas_7d, 0) AS falhas_7d,
    COALESCE(s.sucessos_7d, 0) AS sucessos_7d,
    s.duracao_media_ms
  FROM public.agendamentos_config ac
  LEFT JOIN public.vw_cron_saude s ON s.jobid = ac.jobid_pg_cron
  ORDER BY ac.categoria, ac.nome;
$func$;

GRANT EXECUTE ON FUNCTION public.listar_jobs_com_historico TO authenticated;

-- 3) RPC: togglar_job liga/desliga cron real (cron.schedule/unschedule)
CREATE OR REPLACE FUNCTION public.togglar_job(p_nome text, p_ativo boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $func$
DECLARE
  v_cfg public.agendamentos_config;
  v_jobid integer;
  v_msg text;
BEGIN
  -- Validar admin
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = (SELECT auth.uid()) 
      AND role IN ('admin','platform_admin')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem permissao');
  END IF;

  SELECT * INTO v_cfg FROM public.agendamentos_config WHERE nome = p_nome LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'job nao encontrado em agendamentos_config');
  END IF;

  IF p_ativo THEN
    -- Religar via cron.schedule
    IF v_cfg.cron_expr IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'sem cron_expr cadastrada');
    END IF;
    -- Se job já existe em cron.job e está inactive, drop antes pra recriar
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = p_nome) THEN
      PERFORM cron.unschedule(p_nome);
    END IF;
    -- cron.schedule precisa de comando — usamos sql_inline ou edge_function call.
    -- Por simplicidade aqui, exige sql_inline cadastrado. Edge HTTP fica pra Onda 8 v2.
    IF v_cfg.sql_inline IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'sql_inline ausente — togglar via UI exige sql_inline cadastrado');
    END IF;
    v_jobid := cron.schedule(p_nome, v_cfg.cron_expr, v_cfg.sql_inline);
    v_msg := 'cron religado';
  ELSE
    -- Desligar via cron.unschedule
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = p_nome) THEN
      PERFORM cron.unschedule(p_nome);
      v_msg := 'cron desligado';
    ELSE
      v_msg := 'cron ja estava desligado';
    END IF;
    v_jobid := NULL;
  END IF;

  -- Refletir em agendamentos_config
  UPDATE public.agendamentos_config 
  SET ativo = p_ativo, jobid_pg_cron = v_jobid, atualizado_em = now()
  WHERE nome = p_nome;

  RETURN jsonb_build_object('ok', true, 'msg', v_msg, 'jobid', v_jobid);
END;
$func$;

GRANT EXECUTE ON FUNCTION public.togglar_job(text, boolean) TO authenticated;

;
