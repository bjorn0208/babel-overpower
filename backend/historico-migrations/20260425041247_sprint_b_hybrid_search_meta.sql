CREATE OR REPLACE FUNCTION public.hybrid_search_meta(
  p_query_text       text,
  p_query_embedding  extensions.halfvec(1536),
  p_tenant_id        uuid    DEFAULT NULL,
  p_nicho_id         uuid    DEFAULT NULL,
  p_tag              text    DEFAULT 'qualquer',
  p_match_count      int     DEFAULT 20,
  p_full_text_weight float   DEFAULT 1.0,
  p_semantic_weight  float   DEFAULT 1.0,
  p_rrf_k            int     DEFAULT 50
)
RETURNS TABLE (
  id          uuid,
  escopo      text,
  tag         text,
  corpo       text,
  citacao_kb  text,
  prioridade  int,
  tags        text[],
  imutavel    boolean,
  rrf_score   double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  WITH base AS (
    SELECT mc.*
    FROM public.meta_chunks mc
    WHERE mc.ativo = true
      AND (
        mc.escopo = 'global'
        OR (mc.escopo = 'nicho'  AND p_nicho_id  IS NOT NULL AND mc.nicho_id  = p_nicho_id)
        OR (mc.escopo = 'tenant' AND p_tenant_id IS NOT NULL AND mc.tenant_id = p_tenant_id)
      )
      AND (mc.tag = p_tag OR p_tag = 'qualquer' OR p_tag IS NULL)
      AND NOT EXISTS (
        SELECT 1 FROM public.meta_chunks_tenant_overrides o
        WHERE o.chunk_id = mc.id
          AND p_tenant_id IS NOT NULL
          AND o.tenant_id = p_tenant_id
          AND o.ativo = false
      )
  ),
  full_text AS (
    SELECT b.id,
           ROW_NUMBER() OVER (
             ORDER BY ts_rank_cd(
               to_tsvector('portuguese', coalesce(b.corpo, '')),
               websearch_to_tsquery('portuguese', p_query_text)
             ) DESC
           ) AS rnk
    FROM base b
    WHERE p_query_text IS NOT NULL AND p_query_text <> ''
      AND to_tsvector('portuguese', coalesce(b.corpo, ''))
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
         b.tag,
         b.corpo,
         b.citacao_kb,
         b.prioridade,
         b.tags,
         b.imutavel,
         (coalesce(p_full_text_weight * 1.0 / (p_rrf_k + ft.rnk), 0.0)
        + coalesce(p_semantic_weight * 1.0 / (p_rrf_k + s.rnk), 0.0)) AS rrf_score
  FROM base b
  LEFT JOIN full_text ft ON ft.id = b.id
  LEFT JOIN semantic  s  ON s.id  = b.id
  WHERE ft.id IS NOT NULL OR s.id IS NOT NULL
  ORDER BY rrf_score DESC, b.prioridade DESC NULLS LAST
  LIMIT p_match_count;
$$;

COMMENT ON FUNCTION public.hybrid_search_meta(text, extensions.halfvec, uuid, uuid, text, int, float, float, int) IS
  'Busca hibrida (BM25 portuguese + vector cosine + RRF) em meta_chunks com filtro por tag e cascata escopo (global, nicho, tenant). Honra overrides do tenant. Sprint B · ETAPA 2 · Plano Execucao.md v2.';
;
