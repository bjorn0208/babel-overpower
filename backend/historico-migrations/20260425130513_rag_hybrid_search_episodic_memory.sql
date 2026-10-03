-- 7ª fonte RAG: busca híbrida BM25 + cosine + RRF em episodic_memory.
-- SECURITY DEFINER: chat edge usa service_role (verify_jwt false). Filtro
-- por tenant_id passado explicitamente garante isolamento (igual lead_memory).
-- Coluna real é "ativa" (não "ativo") — schema confirmado via list_tables.
CREATE OR REPLACE FUNCTION public.hybrid_search_episodic_memory(
  p_query_text       text,
  p_query_embedding  halfvec,
  p_tenant_id        uuid,
  p_match_count      integer DEFAULT 3,
  p_full_text_weight double precision DEFAULT 1.0,
  p_semantic_weight  double precision DEFAULT 1.0,
  p_rrf_k            integer DEFAULT 50
)
RETURNS TABLE (
  id              uuid,
  episodio_resumo text,
  gancho          text,
  emocao          text,
  score           double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $$
  WITH base AS (
    SELECT em.*
    FROM public.episodic_memory em
    WHERE em.tenant_id        = p_tenant_id
      AND em.ativa            = true
      AND em.embedding_status = 'ready'
  ),
  keyword AS (
    SELECT b.id,
           row_number() OVER (
             ORDER BY ts_rank(
               to_tsvector('portuguese', coalesce(b.episodio_resumo, '') || ' ' || coalesce(b.gancho, '')),
               plainto_tsquery('portuguese', p_query_text)
             ) DESC
           ) AS rank_k
    FROM base b
    WHERE p_query_text IS NOT NULL
      AND p_query_text <> ''
      AND to_tsvector('portuguese', coalesce(b.episodio_resumo, '') || ' ' || coalesce(b.gancho, ''))
          @@ plainto_tsquery('portuguese', p_query_text)
    LIMIT p_match_count * 2
  ),
  semantic AS (
    SELECT b.id,
           row_number() OVER (ORDER BY b.embedding <=> p_query_embedding ASC) AS rank_s
    FROM base b
    WHERE b.embedding IS NOT NULL
    ORDER BY b.embedding <=> p_query_embedding ASC
    LIMIT p_match_count * 2
  )
  SELECT
    b.id,
    b.episodio_resumo,
    b.gancho,
    b.emocao,
    (
      coalesce(p_full_text_weight * (1.0 / (p_rrf_k + k.rank_k)), 0.0)
    + coalesce(p_semantic_weight  * (1.0 / (p_rrf_k + s.rank_s)), 0.0)
    ) AS score
  FROM base b
  LEFT JOIN keyword  k ON k.id = b.id
  LEFT JOIN semantic s ON s.id = b.id
  WHERE k.id IS NOT NULL OR s.id IS NOT NULL
  ORDER BY score DESC
  LIMIT p_match_count;
$$;

COMMENT ON FUNCTION public.hybrid_search_episodic_memory(text, halfvec, uuid, integer, double precision, double precision, integer) IS
  '7ª fonte RAG do chat — busca híbrida BM25+cosine+RRF em episodic_memory filtrada por tenant_id (cross-tenant leak-proof).';
;
