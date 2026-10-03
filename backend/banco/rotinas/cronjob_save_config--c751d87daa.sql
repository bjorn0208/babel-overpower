CREATE OR REPLACE FUNCTION public.cronjob_save_config(p_id uuid, p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_id uuid := p_id;
  v_nome text := p_payload->>'nome';
  v_descricao text := p_payload->>'descricao';
  v_categoria text := coalesce(p_payload->>'categoria', 'custom');
  v_modo text := coalesce(p_payload->>'modo', 'horario');
  v_cron_expr text := p_payload->>'cron_expr';
  v_edge_function text := p_payload->>'edge_function';
  v_sql_inline text := p_payload->>'sql_inline';
  v_parametros jsonb := coalesce(p_payload->'parametros', '{}'::jsonb);
  v_ativo boolean := coalesce((p_payload->>'ativo')::boolean, true);
  v_motivo text := p_payload->>'motivo_criacao';
  v_jobid_anterior int;
  v_jobid_novo int;
  v_command text;
BEGIN
  IF NOT public._eh_platform_admin() THEN
    RAISE EXCEPTION 'Apenas platform_admin pode gerenciar cronjobs';
  END IF;

  IF v_nome IS NULL OR length(trim(v_nome)) = 0 THEN
    RAISE EXCEPTION 'nome eh obrigatorio';
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.agendamentos_config
      (nome, descricao, categoria, modo, cron_expr, edge_function, sql_inline, parametros, ativo, motivo_criacao, criado_por)
    VALUES
      (v_nome, v_descricao, v_categoria, v_modo, v_cron_expr, v_edge_function, v_sql_inline, v_parametros, v_ativo, v_motivo, (select auth.uid()))
    RETURNING id INTO v_id;
  ELSE
    SELECT jobid_pg_cron INTO v_jobid_anterior FROM public.agendamentos_config WHERE id = v_id;

    UPDATE public.agendamentos_config
       SET nome = v_nome,
           descricao = v_descricao,
           categoria = v_categoria,
           modo = v_modo,
           cron_expr = v_cron_expr,
           edge_function = v_edge_function,
           sql_inline = v_sql_inline,
           parametros = v_parametros,
           ativo = v_ativo,
           motivo_criacao = coalesce(v_motivo, motivo_criacao),
           atualizado_em = now()
     WHERE id = v_id;

    IF v_jobid_anterior IS NOT NULL THEN
      BEGIN
        PERFORM cron.unschedule(v_jobid_anterior);
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
      UPDATE public.agendamentos_config SET jobid_pg_cron = NULL WHERE id = v_id;
    END IF;
  END IF;

  -- Sincroniza pg_cron: agenda quando ativo + cron_expr + (edge_function OU sql_inline)
  IF v_ativo AND v_cron_expr IS NOT NULL AND (v_edge_function IS NOT NULL OR v_sql_inline IS NOT NULL) THEN
    IF v_edge_function IS NOT NULL THEN
      v_command := public._cronjob_montar_command(v_edge_function, v_parametros);
    ELSE
      v_command := v_sql_inline;
    END IF;

    BEGIN
      v_jobid_novo := cron.schedule(v_nome, v_cron_expr, v_command);
      UPDATE public.agendamentos_config SET jobid_pg_cron = v_jobid_novo WHERE id = v_id;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Falha ao agendar cron %: %', v_nome, SQLERRM;
    END;
  END IF;

  RETURN v_id;
END;
$function$

