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
    'conversas', 'leads', 'profiles', 'mensagens',
    'campanhas', 'fases_campanha', 'leads_campanha',
    'memoria_lead', 'lead_memory_fatos', 'crenca_conversa',
    'admin_ia_blocos', 'admin_ia_memoria', 'admin_ia_propostas',
    'admin_ia_relatorios', 'admin_ia_agendamentos', 'admin_ia_acoes',
    'admin_ia_conversas', 'admin_ia_reflexao',
    'blocos_conhecimento', 'blocos_comportamento', 'blocos_gatilho',
    'blocos_humanizacao', 'blocos_variacao', 'blocos_meta',
    'memoria_episodica', 'blocos_procedurais', 'registro_reflexao',
    'observacoes_tag', 'vocabulario_canonico',
    'agentes_usuario', 'logs_requisicao_llm',
    'acao_pausa_blocos', 'automacao_blocos', 'automacao_semantica',
    'diretriz_bolha_blocos', 'emocao_blocos', 'prova_social_blocos',
    'manipulacao_blocos', 'manipulacao_log', 'regras_operacionais_blocos',
    'blocos_padrao', 'candidatos_bloco', 'auditoria_blocos',
    'vocabulario_curadoria', 'alias_vocabulario_tag',
    'overrides_tenant_blocos_conhecimento', 'overrides_tenant_blocos_comportamento',
    'overrides_tenant_blocos_gatilho', 'overrides_tenant_blocos_humanizacao',
    'overrides_tenant_blocos_variacao', 'overrides_tenant_blocos_meta',
    'meta_indicacao_campanha', 'comissoes_indicacao_campanha',
    'loja_implantacao'
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
$function$

