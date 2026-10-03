CREATE OR REPLACE FUNCTION public.admin_agregar(p_tabela text, p_group_by text[] DEFAULT ARRAY[]::text[], p_metricas jsonb DEFAULT '[{"alias": "total", "coluna": "*", "funcao": "count"}]'::jsonb, p_filtros jsonb DEFAULT '{}'::jsonb, p_limite integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_whitelist TEXT[] := ARRAY[
    'conversas', 'leads', 'mensagens', 'profiles',
    'campanhas', 'fases_campanha', 'leads_campanha',
    'lead_memory_fatos', 'admin_ia_blocos', 'admin_ia_memoria',
    'admin_ia_propostas', 'admin_ia_acoes', 'admin_ia_reflexao',
    'blocos_conhecimento', 'blocos_comportamento', 'blocos_gatilho', 'blocos_meta',
    'registro_reflexao', 'observacoes_tag', 'logs_requisicao_llm'
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
$function$

