-- Fase 2B — fix: remove JOIN redundante da v2 de hybrid_search_knowledge
-- O CTE 'base' faz SELECT kc.*, então b.escopo já existe no CTE.
-- O JOIN posterior em knowledge_chunks era desnecessário e causava I/O extra.
-- Apenas a v2 (11 params com p_nicho_id e p_agent_id DEFAULT NULL) é alterada.
-- v1 e hybrid_search_behavior NÃO são tocadas.

DROP FUNCTION IF EXISTS public.hybrid_search_knowledge(
  text, halfvec, uuid, uuid, text, text, integer,
  double precision, double precision, integer, text
);

CREATE OR REPLACE FUNCTION public.hybrid_search_knowledge(
  p_query_text       text,
  p_query_embedding  halfvec,
  p_agent_id         uuid    DEFAULT NULL,
  p_nicho_id         uuid    DEFAULT NULL,
  p_tipo             text    DEFAULT NULL,
  p_category         text    DEFAULT NULL,
  p_match_count      integer DEFAULT 20,
  p_full_text_weight double precision DEFAULT 1.0,
  p_semantic_weight  double precision DEFAULT 1.0,
  p_rrf_k            integer DEFAULT 50,
  p_tom              text    DEFAULT NULL
)
RETURNS TABLE (
  id        uuid,
  agent_id  uuid,
  escopo    text,
  title     text,
  content   text,
  category  text,
  tipo      text,
  tags      text[],
  rrf_score double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
  WITH base AS (
    SELECT kc.*
    FROM public.knowledge_chunks kc
    WHERE kc.ativo = true
      AND (
        kc.escopo = 'global'
        OR (kc.escopo = 'nicho'  AND p_nicho_id IS NOT NULL AND kc.nicho_id  = p_nicho_id)
        OR (kc.escopo = 'tenant' AND p_agent_id IS NOT NULL AND kc.agent_id  = p_agent_id)
      )
      AND (p_tipo     IS NULL OR kc.tipo     = p_tipo)
      AND (p_category IS NULL OR kc.category = p_category)
      -- filtro de tom: NULL devolve tudo; chunk sem tag de tom devolve em qualquer modo
      AND (
        p_tom IS NULL
        OR kc.tags IS NULL
        OR NOT (kc.tags && ARRAY['formal','informal']::text[])
        OR p_tom = ANY(kc.tags)
      )
  ),
  full_text AS (
    SELECT b.id,
           ROW_NUMBER() OVER (ORDER BY ts_rank_cd(b.fts, websearch_to_tsquery('portuguese', p_query_text)) DESC) AS rnk
    FROM base b
    WHERE p_query_text IS NOT NULL AND p_query_text <> ''
      AND b.fts @@ websearch_to_tsquery('portuguese', p_query_text)
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
  SELECT b.id, b.agent_id, b.escopo, b.title, b.content, b.category, b.tipo, b.tags,
         (coalesce(p_full_text_weight * 1.0 / (p_rrf_k + ft.rnk), 0.0)
        + coalesce(p_semantic_weight  * 1.0 / (p_rrf_k + s.rnk),  0.0)) AS rrf_score
  FROM base b
  LEFT JOIN full_text ft ON ft.id = b.id
  LEFT JOIN semantic  s  ON s.id  = b.id
  WHERE ft.id IS NOT NULL OR s.id IS NOT NULL
  ORDER BY rrf_score DESC
  LIMIT p_match_count;
$$;

COMMENT ON FUNCTION public.hybrid_search_knowledge(text, halfvec, uuid, uuid, text, text, integer, double precision, double precision, integer, text) IS
'Busca híbrida em knowledge_chunks — v2 multiescopo (global/nicho/tenant). Suporta filtro por tom (p_tom). JOIN redundante removido na fase 2B-fix.';
;
