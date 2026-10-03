
-- hybrid_search_knowledge passa a suportar cascata global -> nicho -> tenant.
-- Mantem compat: agent_id ainda vale pra escopo='tenant'. Adiciona p_nicho_id opcional.

CREATE OR REPLACE FUNCTION public.hybrid_search_knowledge(
  p_query_text text,
  p_query_embedding halfvec,
  p_agent_id uuid DEFAULT NULL::uuid,
  p_nicho_id uuid DEFAULT NULL::uuid,
  p_tipo text DEFAULT NULL::text,
  p_category text DEFAULT NULL::text,
  p_match_count integer DEFAULT 20,
  p_full_text_weight double precision DEFAULT 1.0,
  p_semantic_weight double precision DEFAULT 1.0,
  p_rrf_k integer DEFAULT 50
)
RETURNS TABLE(id uuid, agent_id uuid, escopo text, title text, content text, category text, tipo text, tags text[], rrf_score double precision)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public','extensions'
AS $function$
  WITH base AS (
    SELECT kc.*
    FROM public.knowledge_chunks kc
    WHERE kc.ativo = true
      AND (
        kc.escopo = 'global'
        OR (kc.escopo = 'nicho' AND p_nicho_id IS NOT NULL AND kc.nicho_id = p_nicho_id)
        OR (kc.escopo = 'tenant' AND p_agent_id IS NOT NULL AND kc.agent_id = p_agent_id)
      )
      AND (p_tipo IS NULL OR kc.tipo = p_tipo)
      AND (p_category IS NULL OR kc.category = p_category)
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
        + coalesce(p_semantic_weight * 1.0 / (p_rrf_k + s.rnk), 0.0)) AS rrf_score
  FROM base b
  LEFT JOIN full_text ft ON ft.id = b.id
  LEFT JOIN semantic s ON s.id = b.id
  WHERE ft.id IS NOT NULL OR s.id IS NOT NULL
  ORDER BY rrf_score DESC
  LIMIT p_match_count;
$function$;

COMMENT ON FUNCTION public.hybrid_search_knowledge(text, halfvec, uuid, uuid, text, text, integer, double precision, double precision, integer) IS
'Busca hibrida em knowledge_chunks com cascata de escopo (global|nicho|tenant). Motor v2.';

;
