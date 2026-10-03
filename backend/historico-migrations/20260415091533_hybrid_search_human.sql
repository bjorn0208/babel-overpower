CREATE OR REPLACE FUNCTION public.hybrid_search_human(
  p_query_text text,
  p_query_embedding halfvec(1536),
  p_tenant_id uuid DEFAULT NULL,
  p_nicho_id uuid DEFAULT NULL,
  p_persona_tags text[] DEFAULT NULL,
  p_match_count int DEFAULT 10,
  p_full_text_weight float DEFAULT 1.0,
  p_semantic_weight float DEFAULT 1.0,
  p_rrf_k int DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  categoria text,
  subcategoria text,
  regra text,
  exemplos_bons text[],
  exemplos_ruins text[],
  contexto_uso text,
  quando_nao_usar text,
  tags_persona text[],
  escopo text,
  prioridade int,
  rrf_score double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  WITH base AS (
    SELECT hc.*
    FROM public.human_chunks hc
    WHERE hc.ativo = true
      AND (
        hc.escopo = 'platform'
        OR (hc.escopo = 'nicho' AND p_nicho_id IS NOT NULL AND hc.nicho_id = p_nicho_id)
        OR (hc.escopo = 'tenant' AND p_tenant_id IS NOT NULL AND hc.tenant_id = p_tenant_id)
      )
      AND (p_persona_tags IS NULL
           OR array_length(p_persona_tags, 1) IS NULL
           OR hc.tags_persona && p_persona_tags)
  ),
  full_text AS (
    SELECT b.id,
           ROW_NUMBER() OVER (
             ORDER BY ts_rank_cd(
               to_tsvector('portuguese', coalesce(b.regra, '') || ' ' || coalesce(b.contexto_uso, '')),
               websearch_to_tsquery('portuguese', p_query_text)
             ) DESC
           ) AS rnk
    FROM base b
    WHERE p_query_text IS NOT NULL AND p_query_text <> ''
      AND to_tsvector('portuguese', coalesce(b.regra, '') || ' ' || coalesce(b.contexto_uso, ''))
          @@ websearch_to_tsquery('portuguese', p_query_text)
    LIMIT 40
  ),
  semantic AS (
    SELECT b.id,
           ROW_NUMBER() OVER (ORDER BY b.embedding <=> p_query_embedding) AS rnk
    FROM base b
    WHERE b.embedding IS NOT NULL
    ORDER BY b.embedding <=> p_query_embedding
    LIMIT 40
  )
  SELECT b.id,
         b.categoria,
         b.subcategoria,
         b.regra,
         b.exemplos_bons,
         b.exemplos_ruins,
         b.contexto_uso,
         b.quando_nao_usar,
         b.tags_persona,
         b.escopo,
         b.prioridade,
         (coalesce(p_full_text_weight * 1.0 / (p_rrf_k + ft.rnk), 0.0)
        + coalesce(p_semantic_weight * 1.0 / (p_rrf_k + s.rnk), 0.0)) AS rrf_score
  FROM base b
  LEFT JOIN full_text ft ON ft.id = b.id
  LEFT JOIN semantic s ON s.id = b.id
  WHERE ft.id IS NOT NULL OR s.id IS NOT NULL
  ORDER BY rrf_score DESC, b.prioridade DESC NULLS LAST
  LIMIT p_match_count;
$$;

COMMENT ON FUNCTION public.hybrid_search_human(text, halfvec, uuid, uuid, text[], int, float, float, int) IS
'Busca hibrida em human_chunks com filtros por escopo e persona (array overlap). Motor v2 (FASE 11).';
;
