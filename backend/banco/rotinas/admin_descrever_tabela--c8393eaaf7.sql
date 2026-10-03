CREATE OR REPLACE FUNCTION public.admin_descrever_tabela(p_tabela text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
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
$function$

