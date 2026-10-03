-- ============================================================================
-- Fechamento — RPC busca_hibrida_emocao (última gaveta) + ativar em sintese
-- Tabela emocao_blocos: id, escopo, nicho_id, tenant_id, emocao, intensidade_match,
--   corpo, exemplos jsonb, ativo, vetor_semantico halfvec, embedding_status,
--   prioridade, tipo_campanha
-- ============================================================================

CREATE OR REPLACE FUNCTION public.busca_hibrida_emocao(
  p_query_text text,
  p_query_embedding extensions.halfvec,
  p_tenant_id uuid DEFAULT NULL,
  p_nicho_id uuid DEFAULT NULL,
  p_top_k integer DEFAULT 3,
  p_threshold numeric DEFAULT 0.35,
  p_intensidade_min numeric DEFAULT 0.0,
  p_rrf_k integer DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  emocao text,
  corpo text,
  intensidade_match numeric,
  escopo text,
  prioridade integer,
  score numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  WITH semantica AS (
    SELECT 
      e.id,
      e.emocao,
      e.corpo,
      e.intensidade_match,
      e.escopo,
      e.prioridade,
      (1 - (e.vetor_semantico <=> p_query_embedding)::numeric) AS sim,
      ROW_NUMBER() OVER (ORDER BY (e.vetor_semantico <=> p_query_embedding) ASC) AS rank_sem
    FROM public.emocao_blocos e
    WHERE e.ativo = true
      AND e.embedding_status = 'pronto'
      AND e.intensidade_match >= p_intensidade_min
      AND (
        e.escopo = 'global'
        OR (e.escopo = 'nicho' AND p_nicho_id IS NOT NULL AND e.nicho_id = p_nicho_id)
        OR (e.escopo = 'tenant' AND p_tenant_id IS NOT NULL AND e.tenant_id = p_tenant_id)
      )
    ORDER BY e.vetor_semantico <=> p_query_embedding
    LIMIT 50
  ),
  lexica AS (
    SELECT 
      e.id,
      ROW_NUMBER() OVER (ORDER BY ts_rank_cd(to_tsvector('portuguese', coalesce(e.corpo,'') || ' ' || coalesce(e.emocao,'')), 
                                              plainto_tsquery('portuguese', p_query_text)) DESC) AS rank_lex
    FROM public.emocao_blocos e
    WHERE e.ativo = true
      AND to_tsvector('portuguese', coalesce(e.corpo,'') || ' ' || coalesce(e.emocao,'')) @@ plainto_tsquery('portuguese', p_query_text)
      AND (
        e.escopo = 'global'
        OR (e.escopo = 'nicho' AND p_nicho_id IS NOT NULL AND e.nicho_id = p_nicho_id)
        OR (e.escopo = 'tenant' AND p_tenant_id IS NOT NULL AND e.tenant_id = p_tenant_id)
      )
    LIMIT 50
  )
  SELECT 
    s.id, s.emocao, s.corpo, s.intensidade_match, s.escopo, s.prioridade,
    (1.0/(p_rrf_k + s.rank_sem) + COALESCE(1.0/(p_rrf_k + l.rank_lex), 0.0))::numeric AS score
  FROM semantica s
  LEFT JOIN lexica l ON l.id = s.id
  WHERE s.sim >= p_threshold
  ORDER BY score DESC
  LIMIT p_top_k;
END;
$$;

GRANT EXECUTE ON FUNCTION public.busca_hibrida_emocao TO authenticated, anon, service_role;

-- Ativar emocao em sintese.gavetas_ativas
UPDATE public.config_chamadas_llm
SET gavetas_ativas = gavetas_ativas || '{
  "emocao": {"ativo": true, "piso": 0.35, "top_n": 2}
}'::jsonb
WHERE chave = 'sintese' AND escopo = 'global';

;
