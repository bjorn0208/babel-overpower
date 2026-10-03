-- RPCs pra Curadoria gerenciar cronjobs com sincronia pg_cron.
-- Toda RPC SECURITY DEFINER + search_path='' + checa platform_admin.

-- Helper: monta SQL command pra net.http_post baseado em edge_function + parametros.
CREATE OR REPLACE FUNCTION public._cronjob_montar_command(p_edge_function text, p_parametros jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT format(
    $cmd$
        SELECT net.http_post(
          url := 'https://pdamarjxcmkzbhqxtapl.supabase.co/functions/v1/%s',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
          ),
          body := %L::jsonb
        ) AS request_id;
    $cmd$,
    p_edge_function,
    coalesce(p_parametros, '{}'::jsonb)::text
  );
$$;

-- Helper interno: garantir admin
CREATE OR REPLACE FUNCTION public._eh_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = (select auth.uid()) AND system_role = 'platform_admin'
  );
$$;

-- Save: upsert de cronjobs_config + sincronia com pg_cron
-- Body esperado:
-- {
--   nome (text), descricao, categoria, modo, cron_expr, edge_function,
--   parametros (jsonb), ativo (bool), motivo_criacao
-- }
CREATE OR REPLACE FUNCTION public.cronjob_save_config(p_id uuid, p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid := p_id;
  v_nome text := p_payload->>'nome';
  v_descricao text := p_payload->>'descricao';
  v_categoria text := coalesce(p_payload->>'categoria', 'custom');
  v_modo text := coalesce(p_payload->>'modo', 'horario');
  v_cron_expr text := p_payload->>'cron_expr';
  v_edge_function text := p_payload->>'edge_function';
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
    RAISE EXCEPTION 'nome é obrigatório';
  END IF;

  -- Upsert na cronjobs_config
  IF v_id IS NULL THEN
    INSERT INTO public.cronjobs_config
      (nome, descricao, categoria, modo, cron_expr, edge_function, parametros, ativo, motivo_criacao, criado_por)
    VALUES
      (v_nome, v_descricao, v_categoria, v_modo, v_cron_expr, v_edge_function, v_parametros, v_ativo, v_motivo, (select auth.uid()))
    RETURNING id INTO v_id;
  ELSE
    SELECT jobid_pg_cron INTO v_jobid_anterior FROM public.cronjobs_config WHERE id = v_id;

    UPDATE public.cronjobs_config
       SET nome = v_nome,
           descricao = v_descricao,
           categoria = v_categoria,
           modo = v_modo,
           cron_expr = v_cron_expr,
           edge_function = v_edge_function,
           parametros = v_parametros,
           ativo = v_ativo,
           motivo_criacao = coalesce(v_motivo, motivo_criacao),
           atualizado_em = now()
     WHERE id = v_id;

    -- Antes de reagendar, desagendar o job antigo (se existir)
    IF v_jobid_anterior IS NOT NULL THEN
      BEGIN
        PERFORM cron.unschedule(v_jobid_anterior);
      EXCEPTION WHEN OTHERS THEN
        -- Job pode não existir mais · ignorar
        NULL;
      END;
      UPDATE public.cronjobs_config SET jobid_pg_cron = NULL WHERE id = v_id;
    END IF;
  END IF;

  -- Sincroniza pg_cron: agenda só quando ativo + cron_expr + edge_function presentes
  IF v_ativo AND v_cron_expr IS NOT NULL AND v_edge_function IS NOT NULL THEN
    v_command := public._cronjob_montar_command(v_edge_function, v_parametros);
    BEGIN
      v_jobid_novo := cron.schedule(v_nome, v_cron_expr, v_command);
      UPDATE public.cronjobs_config SET jobid_pg_cron = v_jobid_novo WHERE id = v_id;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Falha ao agendar cron %: %', v_nome, SQLERRM;
    END;
  END IF;

  RETURN v_id;
END;
$$;

-- Toggle ativo: flipa + sincroniza
CREATE OR REPLACE FUNCTION public.cronjob_toggle_ativo(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_atual record;
  v_novo_ativo boolean;
  v_jobid_novo int;
  v_command text;
BEGIN
  IF NOT public._eh_platform_admin() THEN
    RAISE EXCEPTION 'Apenas platform_admin pode gerenciar cronjobs';
  END IF;

  SELECT * INTO v_atual FROM public.cronjobs_config WHERE id = p_id;
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

  UPDATE public.cronjobs_config
     SET ativo = v_novo_ativo,
         jobid_pg_cron = v_jobid_novo,
         atualizado_em = now()
   WHERE id = p_id;

  RETURN v_novo_ativo;
END;
$$;

-- Delete: unschedule + remove
CREATE OR REPLACE FUNCTION public.cronjob_delete_config(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_jobid int;
BEGIN
  IF NOT public._eh_platform_admin() THEN
    RAISE EXCEPTION 'Apenas platform_admin pode gerenciar cronjobs';
  END IF;

  SELECT jobid_pg_cron INTO v_jobid FROM public.cronjobs_config WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_jobid IS NOT NULL THEN
    BEGIN
      PERFORM cron.unschedule(v_jobid);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  DELETE FROM public.cronjobs_config WHERE id = p_id;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cronjob_save_config(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cronjob_toggle_ativo(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cronjob_delete_config(uuid) TO authenticated;
;
