CREATE OR REPLACE FUNCTION public.admin_query_sql(p_query TEXT, p_limite INT DEFAULT 100)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_query TEXT := trim(p_query);
  v_lower TEXT := lower(v_query);
  v_resultado JSONB;
  v_limite INT := least(coalesce(p_limite, 100), 500);
  v_whitelist TEXT[] := ARRAY[
    'conversations', 'leads', 'profiles', 'messages',
    'campaigns', 'campaign_phases', 'campaign_leads',
    'lead_memory', 'lead_memory_fatos', 'conversation_belief',
    'admin_ia_chunks', 'admin_ia_memoria', 'admin_ia_propostas',
    'admin_ia_relatorios', 'admin_ia_cronjobs', 'admin_ia_actions',
    'admin_ia_conversations', 'admin_ia_reflection',
    'knowledge_chunks', 'behavior_chunks', 'trigger_chunks',
    'human_chunks', 'variation_chunks', 'meta_chunks',
    'episodic_memory', 'procedural_chunks', 'reflection_log',
    'tag_observations', 'vocabulario_canonico',
    'user_agents', 'llm_request_logs'
  ];
  v_t TEXT;
  v_tabela_ok BOOLEAN := false;
BEGIN
  IF v_query = '' THEN
    RAISE EXCEPTION 'query_vazia';
  END IF;
  IF NOT v_lower ~ '^\s*select\s' THEN
    RAISE EXCEPTION 'apenas_select_permitido';
  END IF;
  IF v_lower ~* '\m(insert|update|delete|drop|truncate|alter|create|grant|revoke|copy|do)\M' THEN
    RAISE EXCEPTION 'mutacao_proibida';
  END IF;
  IF position(';' IN trim(trailing ';' FROM v_query)) > 0 THEN
    RAISE EXCEPTION 'multiplas_statements_proibidas';
  END IF;
  -- Checa whitelist via padrão "from <tabela>" ou "join <tabela>" (com possível schema prefix)
  FOREACH v_t IN ARRAY v_whitelist LOOP
    IF v_lower ~ ('(from|join)\s+(public\.)?' || v_t || '(\s|$)') THEN
      v_tabela_ok := true;
      EXIT;
    END IF;
  END LOOP;
  IF NOT v_tabela_ok THEN
    RAISE EXCEPTION 'nenhuma_tabela_do_whitelist_encontrada';
  END IF;

  IF NOT v_lower ~* '\mlimit\s+\d+' THEN
    v_query := v_query || ' LIMIT ' || v_limite;
  END IF;

  PERFORM set_config('statement_timeout', '5s', true);
  EXECUTE 'SELECT coalesce(jsonb_agg(t), ''[]''::jsonb) FROM (' || v_query || ') t' INTO v_resultado;
  RETURN v_resultado;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('erro', SQLERRM, 'sql_state', SQLSTATE);
END;
$$;
;
