CREATE OR REPLACE FUNCTION public.cronjob_run_now(p_cronjob_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault', 'extensions'
AS $function$
DECLARE
  v_config record;
  v_log_id uuid;
  v_request_id bigint;
BEGIN
  SELECT * INTO v_config FROM public.agendamentos_config WHERE id = p_cronjob_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'cronjob nao encontrado');
  END IF;

  -- Inserir log com resultado='disparado_manualmente'
  INSERT INTO public.agendamentos_log (cronjob_id, cronjob_nome, iniciou_em, resultado)
  VALUES (v_config.id, v_config.nome, now(), 'disparado_manualmente')
  RETURNING id INTO v_log_id;

  IF v_config.edge_function IS NOT NULL THEN
    -- Disparar via http_post
    SELECT net.http_post(
      url := 'https://pdamarjxcmkzbhqxtapl.supabase.co/functions/v1/' || v_config.edge_function,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
      ),
      body := coalesce(v_config.parametros, '{}'::jsonb)
    ) INTO v_request_id;

    UPDATE public.agendamentos_log
    SET payload_input = coalesce(v_config.parametros, '{}'::jsonb)
    WHERE id = v_log_id;

    RETURN jsonb_build_object('ok', true, 'request_id', v_request_id, 'log_id', v_log_id);

  ELSIF v_config.sql_inline IS NOT NULL THEN
    EXECUTE v_config.sql_inline;
    UPDATE public.agendamentos_log
    SET resultado = 'sucesso',
        terminou_em = now(),
        duracao_ms = EXTRACT(MILLISECONDS FROM (now() - iniciou_em))::int
    WHERE id = v_log_id;
    RETURN jsonb_build_object('ok', true, 'log_id', v_log_id);

  ELSE
    UPDATE public.agendamentos_log
    SET resultado = 'erro',
        erro_mensagem = 'sem edge_function nem sql_inline'
    WHERE id = v_log_id;
    RETURN jsonb_build_object('ok', false, 'erro', 'cronjob sem ação configurada');
  END IF;
END;
$function$

