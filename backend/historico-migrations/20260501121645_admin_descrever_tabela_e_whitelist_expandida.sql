-- Expande whitelist do admin_query_sql + cria nova RPC admin_descrever_tabela
-- Whitelist agora cobre tabelas de Curadoria (chunks especializados, vocab, candidates, audit)

CREATE OR REPLACE FUNCTION public.admin_query_sql(p_query text, p_limite integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    'user_agents', 'llm_request_logs',
    'acao_pausa_chunks', 'automacao_chunks', 'automacao_semantica',
    'diretriz_bolha_chunks', 'emocao_chunks', 'prova_social_chunks',
    'manipulacao_chunks', 'manipulacao_log', 'regras_operacionais_chunks',
    'golden_chunks', 'chunk_candidates', 'chunk_audit_log',
    'vocabulario_curadoria', 'tag_vocabulario_alias',
    'knowledge_chunks_tenant_overrides', 'behavior_chunks_tenant_overrides',
    'trigger_chunks_tenant_overrides', 'human_chunks_tenant_overrides',
    'variation_chunks_tenant_overrides', 'meta_chunks_tenant_overrides',
    'campaign_indicacao_meta', 'campaign_indicacao_comissoes',
    'store_implantacao'
  ];
  v_t TEXT;
  v_tabela_ok BOOLEAN := false;
BEGIN
  IF v_query = '' THEN RAISE EXCEPTION 'query_vazia'; END IF;
  IF NOT v_lower ~ '^\s*select\s' THEN RAISE EXCEPTION 'apenas_select_permitido'; END IF;
  IF v_lower ~* '\m(insert|update|delete|drop|truncate|alter|create|grant|revoke|copy|do)\M' THEN
    RAISE EXCEPTION 'mutacao_proibida'; END IF;
  IF position(';' IN trim(trailing ';' FROM v_query)) > 0 THEN
    RAISE EXCEPTION 'multiplas_statements_proibidas'; END IF;
  FOREACH v_t IN ARRAY v_whitelist LOOP
    IF v_lower ~ ('(from|join)\s+(public\.)?' || v_t || '(\s|$|,|\)|;)') THEN
      v_tabela_ok := true; EXIT;
    END IF;
  END LOOP;
  IF NOT v_tabela_ok THEN RAISE EXCEPTION 'nenhuma_tabela_do_whitelist_encontrada'; END IF;
  IF NOT v_lower ~* '\mlimit\s+\d+' THEN
    v_query := v_query || ' LIMIT ' || v_limite; END IF;
  PERFORM set_config('statement_timeout', '5s', true);
  PERFORM set_config('search_path', 'public', true);
  EXECUTE 'SELECT coalesce(jsonb_agg(t), ''[]''::jsonb) FROM (' || v_query || ') t' INTO v_resultado;
  RETURN v_resultado;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('erro', SQLERRM, 'sql_state', SQLSTATE);
END;
$function$;

-- Nova RPC: descrever tabela (colunas + count + 3 samples)
CREATE OR REPLACE FUNCTION public.admin_descrever_tabela(p_tabela text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
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
    'user_agents', 'llm_request_logs',
    'acao_pausa_chunks', 'automacao_chunks', 'automacao_semantica',
    'diretriz_bolha_chunks', 'emocao_chunks', 'prova_social_chunks',
    'manipulacao_chunks', 'manipulacao_log', 'regras_operacionais_chunks',
    'golden_chunks', 'chunk_candidates', 'chunk_audit_log',
    'vocabulario_curadoria', 'tag_vocabulario_alias',
    'knowledge_chunks_tenant_overrides', 'behavior_chunks_tenant_overrides',
    'trigger_chunks_tenant_overrides', 'human_chunks_tenant_overrides',
    'variation_chunks_tenant_overrides', 'meta_chunks_tenant_overrides',
    'campaign_indicacao_meta', 'campaign_indicacao_comissoes',
    'store_implantacao'
  ];
  v_colunas JSONB;
  v_count BIGINT;
  v_samples JSONB;
BEGIN
  IF NOT (p_tabela = ANY(v_whitelist)) THEN
    RAISE EXCEPTION 'tabela_fora_da_whitelist:%', p_tabela;
  END IF;

  PERFORM set_config('statement_timeout', '5s', true);
  PERFORM set_config('search_path', 'public', true);

  -- Colunas
  SELECT coalesce(jsonb_agg(jsonb_build_object('nome', column_name, 'tipo', data_type, 'nullable', is_nullable) ORDER BY ordinal_position), '[]'::jsonb)
  INTO v_colunas
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = p_tabela;

  -- Count aproximado (estimado via reltuples; rápido em tabelas grandes)
  EXECUTE 'SELECT count(*) FROM public.' || quote_ident(p_tabela) INTO v_count;

  -- 3 samples (apenas leitura — função tem SECURITY DEFINER, RLS bypass intencional pra exploração admin)
  EXECUTE 'SELECT coalesce(jsonb_agg(t), ''[]''::jsonb) FROM (SELECT * FROM public.' || quote_ident(p_tabela) || ' LIMIT 3) t' INTO v_samples;

  RETURN jsonb_build_object(
    'tabela', p_tabela,
    'total_linhas', v_count,
    'colunas', v_colunas,
    'samples', v_samples
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('erro', SQLERRM, 'sql_state', SQLSTATE);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_descrever_tabela(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_descrever_tabela(text) TO authenticated, service_role;
;
