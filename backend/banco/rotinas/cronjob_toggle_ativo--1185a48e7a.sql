CREATE OR REPLACE FUNCTION public.cronjob_toggle_ativo(p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_atual record;
  v_novo_ativo boolean;
  v_jobid_novo int;
  v_command text;
BEGIN
  IF NOT public._eh_platform_admin() THEN
    RAISE EXCEPTION 'Apenas platform_admin pode gerenciar cronjobs';
  END IF;

  SELECT * INTO v_atual FROM public.agendamentos_config WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cronjob % não encontrado', p_id;
  END IF;

  v_novo_ativo := NOT v_atual.ativo;

  -- Sincroniza pg_cron
  IF v_novo_ativo THEN
    -- Agendar
    IF v_atual.cron_expr IS NOT NULL AND v_atual.edge_function IS NOT NULL THEN
      v_command := public._cronjob_montar_command(v_atual.edge_function, coalesce(v_atual.parametros, '{}'::jsonb));
      BEGIN
        v_jobid_novo := cron.schedule(v_atual.nome, v_atual.cron_expr, v_command);
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Falha ao agendar %: %', v_atual.nome, SQLERRM;
        v_jobid_novo := NULL;
      END;
    END IF;
  ELSE
    -- Desagendar
    IF v_atual.jobid_pg_cron IS NOT NULL THEN
      BEGIN
        PERFORM cron.unschedule(v_atual.jobid_pg_cron);
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;
    v_jobid_novo := NULL;
  END IF;

  UPDATE public.agendamentos_config
     SET ativo = v_novo_ativo,
         jobid_pg_cron = v_jobid_novo,
         atualizado_em = now()
   WHERE id = p_id;

  RETURN v_novo_ativo;
END;
$function$

