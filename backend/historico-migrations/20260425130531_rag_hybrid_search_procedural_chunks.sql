-- 8ª fonte RAG: busca híbrida BM25 + cosine + RRF em procedural_chunks.
-- Cascata de escopo: global + nicho (se houver) + tenant (se houver).
-- Boost de +0.1 no score quando escopo='tenant' (procedimento custom > global).
-- SECURITY DEFINER + tenant_id explícito (chat usa service_role).
CREATE OR REPLACE FUNCTION public.hybrid_search_procedural_chunks(
  p_query_text       text,
  p_query_embedding  halfvec,
  p_tenant_id        uuid,
  p_nicho_id         uuid    DEFAULT NULL,
  p_match_count      integer DEFAULT 2,
  p_full_text_weight double precision DEFAULT 1.0,
  p_semantic_weight  double precision DEFAULT 1.0,
  p_rrf_k            integer DEFAULT 50,
  p_tenant_boost     double precision DEFAULT 0.1
)
RETURNS TABLE (
  id                uuid,
  nome_procedimento text,
  passos            jsonb,
  citacao_kb        text,
  escopo            text,
  score             double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $$
  WITH base AS (
    SELECT pc.*
    FROM public.procedural_chunks pc
    WHERE pc.ativo            = true
      AND pc.deleted_at        IS NULL
      AND pc.embedding_status = 'ready'
      AND (
            pc.escopo = 'global'
        OR (pc.escopo = 'nicho'  AND p_nicho_id  IS NOT NULL AND pc.nicho_id  = p_nicho_id)
        OR (pc.escopo = 'tenant' AND p_tenant_id IS NOT NULL AND pc.tenant_id = p_tenant_id)
      )
  ),
  passos_text AS (
    SELECT b.id,
           coalesce(b.nome_procedimento, '')
           || ' ' ||
           coalesce(
             (SELECT string_agg(coalesce(p->>'acao','') || ' ' || coalesce(p->>'texto',''), ' ')
              FROM jsonb_array_elements(b.passos) p),
             ''
           ) AS texto
    FROM base b
  ),
  keyword AS (
    SELECT pt.id,
           row_number() OVER (
             ORDER BY ts_rank(to_tsvector('portuguese', pt.texto),
                              plainto_tsquery('portuguese', p_query_text)) DESC
           ) AS rank_k
    FROM passos_text pt
    WHERE p_query_text IS NOT NULL
      AND p_query_text <> ''
      AND to_tsvector('portuguese', pt.texto) @@ plainto_tsquery('portuguese', p_query_text)
    LIMIT p_match_count * 4
  ),
  semantic AS (
    SELECT b.id,
           row_number() OVER (ORDER BY b.embedding <=> p_query_embedding ASC) AS rank_s
    FROM base b
    WHERE b.embedding IS NOT NULL
    ORDER BY b.embedding <=> p_query_embedding ASC
    LIMIT p_match_count * 4
  )
  SELECT
    b.id,
    b.nome_procedimento,
    b.passos,
    b.citacao_kb,
    b.escopo,
    (
      coalesce(p_full_text_weight * (1.0 / (p_rrf_k + k.rank_k)), 0.0)
    + coalesce(p_semantic_weight  * (1.0 / (p_rrf_k + s.rank_s)), 0.0)
    + CASE WHEN b.escopo = 'tenant' THEN p_tenant_boost ELSE 0.0 END
    ) AS score
  FROM base b
  LEFT JOIN keyword  k ON k.id = b.id
  LEFT JOIN semantic s ON s.id = b.id
  WHERE k.id IS NOT NULL OR s.id IS NOT NULL
  ORDER BY score DESC
  LIMIT p_match_count;
$$;

COMMENT ON FUNCTION public.hybrid_search_procedural_chunks(text, halfvec, uuid, uuid, integer, double precision, double precision, integer, double precision) IS
  '8ª fonte RAG do chat — busca híbrida BM25+cosine+RRF em procedural_chunks com cascata de escopo (global<nicho<tenant) e boost +0.1 pra escopo tenant.';
;
