CREATE OR REPLACE FUNCTION public.togglar_job(p_nome text, p_ativo boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$

