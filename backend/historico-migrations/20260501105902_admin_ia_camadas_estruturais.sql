-- ============================================================
-- Admin IA · Camadas Estruturais · Sprint 1+2
-- Adiciona: estado_sessao, admin_ia_reflection, 2 RPCs (query_sql, agregar)
-- ============================================================

-- 1. estado_sessao em admin_ia_conversations
ALTER TABLE public.admin_ia_conversations
  ADD COLUMN IF NOT EXISTS estado_sessao jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_admin_ia_conv_estado_atualizado
  ON public.admin_ia_conversations ((estado_sessao->>'atualizado_em'))
  WHERE estado_sessao != '{}'::jsonb;

-- 2. admin_ia_reflection — verificador async grava aqui
CREATE TABLE IF NOT EXISTS public.admin_ia_reflection (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_conversation_id UUID REFERENCES public.admin_ia_conversations(id) ON DELETE CASCADE,
  turno_idx INT,
  motivo TEXT NOT NULL CHECK (motivo IN (
    'inventou_campo', 'inventou_tool', 'dump_ids', 'tool_vazia_sem_alternativa',
    'sem_evidencia', 'granularidade_errada', 'esqueceu_estado', 'outro'
  )),
  score NUMERIC(3,2) NOT NULL CHECK (score >= 0 AND score <= 1),
  detalhe JSONB NOT NULL DEFAULT '{}'::jsonb,
  resposta_original TEXT,
  modelo_executor TEXT,
  destilado_em_chunk_id UUID,
  falso_positivo BOOLEAN NOT NULL DEFAULT false,
  marcado_falso_em TIMESTAMPTZ,
  marcado_falso_por UUID,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_ia_reflection_motivo
  ON public.admin_ia_reflection (motivo, criado_em DESC)
  WHERE falso_positivo = false AND destilado_em_chunk_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_admin_ia_reflection_conv
  ON public.admin_ia_reflection (admin_conversation_id, criado_em DESC);

ALTER TABLE public.admin_ia_reflection ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_ia_reflection_platform_admin ON public.admin_ia_reflection FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.system_role = 'platform_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.system_role = 'platform_admin'));

-- 3. RPC admin_query_sql — read-only com whitelist + timeout
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
  -- Validações de segurança
  IF v_query = '' THEN
    RAISE EXCEPTION 'query_vazia';
  END IF;
  IF NOT v_lower ~ '^\s*select\s' THEN
    RAISE EXCEPTION 'apenas_select_permitido';
  END IF;
  -- Bloqueia palavras-chave de mutação
  IF v_lower ~* '\b(insert|update|delete|drop|truncate|alter|create|grant|revoke|copy|do\s|call\s)\b' THEN
    RAISE EXCEPTION 'mutacao_proibida';
  END IF;
  -- Bloqueia múltiplas statements
  IF position(';' IN trim(trailing ';' FROM v_query)) > 0 THEN
    RAISE EXCEPTION 'multiplas_statements_proibidas';
  END IF;
  -- Pelo menos 1 tabela do whitelist deve aparecer
  FOREACH v_t IN ARRAY v_whitelist LOOP
    IF v_lower ~ ('\b' || v_t || '\b') THEN
      v_tabela_ok := true;
      EXIT;
    END IF;
  END LOOP;
  IF NOT v_tabela_ok THEN
    RAISE EXCEPTION 'nenhuma_tabela_do_whitelist_encontrada';
  END IF;

  -- Adiciona LIMIT se não tem
  IF NOT v_lower ~* '\blimit\s+\d+' THEN
    v_query := v_query || ' LIMIT ' || v_limite;
  END IF;

  -- Statement timeout
  PERFORM set_config('statement_timeout', '5s', true);

  -- Executa em sub-query
  EXECUTE 'SELECT coalesce(jsonb_agg(t), ''[]''::jsonb) FROM (' || v_query || ') t' INTO v_resultado;
  RETURN v_resultado;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('erro', SQLERRM, 'sql_state', SQLSTATE);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_query_sql TO authenticated, service_role;

-- 4. RPC admin_agregar — agregação dinâmica
CREATE OR REPLACE FUNCTION public.admin_agregar(
  p_tabela TEXT,
  p_group_by TEXT[] DEFAULT ARRAY[]::TEXT[],
  p_metricas JSONB DEFAULT '[{"funcao":"count","coluna":"*","alias":"total"}]'::jsonb,
  p_filtros JSONB DEFAULT '{}'::jsonb,
  p_limite INT DEFAULT 100
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_whitelist TEXT[] := ARRAY[
    'conversations', 'leads', 'messages', 'profiles',
    'campaigns', 'campaign_phases', 'campaign_leads',
    'lead_memory_fatos', 'admin_ia_chunks', 'admin_ia_memoria',
    'admin_ia_propostas', 'admin_ia_actions', 'admin_ia_reflection',
    'knowledge_chunks', 'behavior_chunks', 'trigger_chunks', 'meta_chunks',
    'reflection_log', 'tag_observations', 'llm_request_logs'
  ];
  v_select TEXT := '';
  v_group_clause TEXT := '';
  v_where TEXT := '';
  v_query TEXT;
  v_metrica JSONB;
  v_func TEXT;
  v_col TEXT;
  v_alias TEXT;
  v_filtro_key TEXT;
  v_filtro_val TEXT;
  v_resultado JSONB;
  v_safe_ident TEXT := '^[a-z_][a-z0-9_]{0,40}$';
BEGIN
  IF NOT (p_tabela = ANY(v_whitelist)) THEN
    RAISE EXCEPTION 'tabela_fora_whitelist:%', p_tabela;
  END IF;

  -- group_by
  IF array_length(p_group_by, 1) > 0 THEN
    FOR i IN 1..array_length(p_group_by, 1) LOOP
      IF NOT (p_group_by[i] ~ v_safe_ident) THEN
        RAISE EXCEPTION 'group_by_invalido:%', p_group_by[i];
      END IF;
      v_select := v_select || quote_ident(p_group_by[i]) || ', ';
      IF v_group_clause = '' THEN v_group_clause := ' GROUP BY ' || quote_ident(p_group_by[i]);
      ELSE v_group_clause := v_group_clause || ', ' || quote_ident(p_group_by[i]); END IF;
    END LOOP;
  END IF;

  -- metricas
  FOR v_metrica IN SELECT jsonb_array_elements(p_metricas) LOOP
    v_func := lower(v_metrica->>'funcao');
    v_col := v_metrica->>'coluna';
    v_alias := v_metrica->>'alias';
    IF NOT (v_func IN ('count', 'sum', 'avg', 'min', 'max')) THEN
      RAISE EXCEPTION 'funcao_invalida:%', v_func;
    END IF;
    IF v_col != '*' AND NOT (v_col ~ v_safe_ident) THEN
      RAISE EXCEPTION 'coluna_invalida:%', v_col;
    END IF;
    IF NOT (v_alias ~ v_safe_ident) THEN
      RAISE EXCEPTION 'alias_invalido:%', v_alias;
    END IF;
    v_select := v_select || upper(v_func) || '(' || (CASE WHEN v_col='*' THEN '*' ELSE quote_ident(v_col) END) || ') AS ' || quote_ident(v_alias) || ', ';
  END LOOP;

  v_select := rtrim(v_select, ', ');

  -- filtros simples (jsonb tipo {coluna: valor})
  FOR v_filtro_key IN SELECT * FROM jsonb_object_keys(p_filtros) LOOP
    IF NOT (v_filtro_key ~ v_safe_ident) THEN
      RAISE EXCEPTION 'filtro_invalido:%', v_filtro_key;
    END IF;
    v_filtro_val := p_filtros->>v_filtro_key;
    IF v_where = '' THEN v_where := ' WHERE '; ELSE v_where := v_where || ' AND '; END IF;
    v_where := v_where || quote_ident(v_filtro_key) || ' = ' || quote_literal(v_filtro_val);
  END LOOP;

  v_query := 'SELECT ' || v_select || ' FROM public.' || quote_ident(p_tabela) || v_where || v_group_clause || ' LIMIT ' || least(coalesce(p_limite, 100), 500);

  PERFORM set_config('statement_timeout', '5s', true);
  EXECUTE 'SELECT coalesce(jsonb_agg(t), ''[]''::jsonb) FROM (' || v_query || ') t' INTO v_resultado;
  RETURN v_resultado;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('erro', SQLERRM, 'sql_state', SQLSTATE);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_agregar TO authenticated, service_role;
;
