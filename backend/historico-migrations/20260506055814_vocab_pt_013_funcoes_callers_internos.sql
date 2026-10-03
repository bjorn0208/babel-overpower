
-- Migration 13 — 8 funções com callers internos
-- Estratégia: ALTER RENAME + wrapper EN (zero-break pra callers em policies/funções)

DO $$
DECLARE
  pair JSONB;
  v_velho TEXT;
  v_novo TEXT;
  v_args TEXT;
  v_args_identity TEXT;
  v_returns TEXT;
  v_args_call TEXT;
  v_count_rename INT := 0;
  v_count_wrapper INT := 0;
  v_select_clause TEXT;
  mapeamento JSONB := '[
    ["is_platform_admin","eh_admin_plataforma"],
    ["check_public_rate_limit","verificar_limite_taxa_publico"],
    ["derive_tags_for_lead","derivar_tags_para_lead"],
    ["fn_scheduled_actions_set_campaign_id","fn_acoes_agendadas_definir_campanha_id"],
    ["record_conversation_ticket","registrar_ticket_conversa"],
    ["remove_team_member","remover_membro_equipe"],
    ["set_custom_field","definir_campo_customizado"],
    ["set_updated_at","definir_atualizado_em_v2"]
  ]'::jsonb;
BEGIN
  FOR pair IN SELECT * FROM jsonb_array_elements(mapeamento) LOOP
    v_velho := pair->>0;
    v_novo := pair->>1;
    
    -- Rename só se velho ainda existe
    IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=v_velho) THEN
      SELECT pg_get_function_identity_arguments(p.oid)
      INTO v_args_identity
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = v_velho LIMIT 1;
      
      EXECUTE format('ALTER FUNCTION public.%I(%s) RENAME TO %I', v_velho, COALESCE(v_args_identity, ''), v_novo);
      v_count_rename := v_count_rename + 1;
    END IF;
    
    -- Criar wrapper EN se não existe ainda
    SELECT 
      pg_get_function_arguments(p.oid),
      pg_get_function_identity_arguments(p.oid),
      pg_get_function_result(p.oid),
      (
        SELECT string_agg(arg_name, ', ')
        FROM (
          SELECT 
            p.proargnames[i] AS arg_name,
            COALESCE(p.proargmodes[i], 'i') AS arg_mode
          FROM generate_subscripts(COALESCE(p.proargnames, ARRAY[]::text[]), 1) AS i
        ) sub
        WHERE arg_mode IN ('i','b','v')
      )
    INTO v_args, v_args_identity, v_returns, v_args_call
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = v_novo
    LIMIT 1;
    
    IF v_args IS NULL THEN CONTINUE; END IF;
    IF v_returns = 'trigger' THEN CONTINUE; END IF;
    IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=v_velho) THEN CONTINUE; END IF;
    
    IF v_returns LIKE 'TABLE%' OR v_returns LIKE 'SETOF%' THEN
      v_select_clause := format('SELECT * FROM public.%I(%s)', v_novo, COALESCE(v_args_call, ''));
    ELSE
      v_select_clause := format('SELECT public.%I(%s)', v_novo, COALESCE(v_args_call, ''));
    END IF;
    
    EXECUTE format(
      'CREATE FUNCTION public.%I(%s) RETURNS %s LANGUAGE sql SECURITY DEFINER SET search_path = '''' AS $f$ %s $f$',
      v_velho, COALESCE(v_args, ''), v_returns, v_select_clause
    );
    EXECUTE format('COMMENT ON FUNCTION public.%I(%s) IS ''DEPRECATED — use %I''', v_velho, v_args_identity, v_novo);
    v_count_wrapper := v_count_wrapper + 1;
  END LOOP;
  
  RAISE NOTICE 'Renames: %, Wrappers: %', v_count_rename, v_count_wrapper;
END $$;

-- Validação consolidada
DO $$
DECLARE 
  v_count INT;
BEGIN
  SELECT count(*) INTO v_count FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname IN (
      'eh_admin_plataforma','verificar_limite_taxa_publico','derivar_tags_para_lead',
      'fn_acoes_agendadas_definir_campanha_id','registrar_ticket_conversa',
      'remover_membro_equipe','definir_campo_customizado','definir_atualizado_em_v2'
    );
  RAISE NOTICE 'Funções PT criadas: % (esperado: 8)', v_count;
END $$;

;
