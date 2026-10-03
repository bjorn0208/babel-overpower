CREATE OR REPLACE FUNCTION public.hybrid_search_behavior(
  p_query_text text,
  p_query_embedding halfvec(1536),
  p_tenant_id uuid DEFAULT NULL,
  p_nicho_id uuid DEFAULT NULL,
  p_produto_id uuid DEFAULT NULL,
  p_fase text DEFAULT 'qualquer',
  p_match_count int DEFAULT 20,
  p_full_text_weight float DEFAULT 1.0,
  p_semantic_weight float DEFAULT 1.0,
  p_rrf_k int DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  escopo text,
  rotulo_curto text,
  situacao_descricao text,
  instrucao text,
  fase_aplicavel text,
  prioridade int,
  tags text[],
  rrf_score double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  WITH base AS (
    SELECT bc.*
    FROM public.behavior_chunks bc
    WHERE bc.ativo = true
      AND (
        bc.escopo = 'platform'
        OR (bc.escopo = 'nicho' AND p_nicho_id IS NOT NULL AND bc.nicho_id = p_nicho_id)
        OR (bc.escopo IN ('tenant_config', 'tenant_custom') AND p_tenant_id IS NOT NULL AND bc.tenant_id = p_tenant_id)
        OR (bc.escopo = 'product_specific' AND p_tenant_id IS NOT NULL AND p_produto_id IS NOT NULL
            AND bc.tenant_id = p_tenant_id AND bc.produto_id = p_produto_id)
      )
      AND (bc.fase_aplicavel = p_fase OR bc.fase_aplicavel = 'qualquer' OR bc.fase_aplicavel IS NULL)
      AND NOT EXISTS (
        SELECT 1 FROM public.behavior_chunks_tenant_overrides o
        WHERE o.chunk_id = bc.id
          AND p_tenant_id IS NOT NULL
          AND o.tenant_id = p_tenant_id
          AND o.ativo = false
      )
  ),
  full_text AS (
    SELECT b.id,
           ROW_NUMBER() OVER (
             ORDER BY ts_rank_cd(
               to_tsvector('portuguese', coalesce(b.situacao_descricao, '') || ' ' || coalesce(b.instrucao, '')),
               websearch_to_tsquery('portuguese', p_query_text)
             ) DESC
           ) AS rnk
    FROM base b
    WHERE p_query_text IS NOT NULL AND p_query_text <> ''
      AND to_tsvector('portuguese', coalesce(b.situacao_descricao, '') || ' ' || coalesce(b.instrucao, ''))
          @@ websearch_to_tsquery('portuguese', p_query_text)
    LIMIT 60
  ),
  semantic AS (
    SELECT b.id,
           ROW_NUMBER() OVER (ORDER BY b.embedding <=> p_query_embedding) AS rnk
    FROM base b
    WHERE b.embedding IS NOT NULL
    ORDER BY b.embedding <=> p_query_embedding
    LIMIT 60
  )
  SELECT b.id,
         b.escopo,
         b.rotulo_curto,
         b.situacao_descricao,
         b.instrucao,
         b.fase_aplicavel,
         b.prioridade,
         b.tags,
         (coalesce(p_full_text_weight * 1.0 / (p_rrf_k + ft.rnk), 0.0)
        + coalesce(p_semantic_weight * 1.0 / (p_rrf_k + s.rnk), 0.0)) AS rrf_score
  FROM base b
  LEFT JOIN full_text ft ON ft.id = b.id
  LEFT JOIN semantic s ON s.id = b.id
  WHERE ft.id IS NOT NULL OR s.id IS NOT NULL
  ORDER BY rrf_score DESC, b.prioridade DESC NULLS LAST
  LIMIT p_match_count;
$$;

COMMENT ON FUNCTION public.hybrid_search_behavior(text, halfvec, uuid, uuid, uuid, text, int, float, float, int) IS
'Busca hibrida (BM25 + vector + RRF) em behavior_chunks com filtros de escopo/fase e overrides do tenant. Motor v2 (FASE 11).';
;
