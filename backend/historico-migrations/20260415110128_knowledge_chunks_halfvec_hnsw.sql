-- FASE 11.5.c: alinhar knowledge_chunks com behavior/human/trigger (halfvec) + HNSW.
-- Reduz storage 50% e habilita busca vetorial sub-10ms.

ALTER TABLE public.knowledge_chunks
  ALTER COLUMN embedding TYPE halfvec(1536) USING embedding::halfvec(1536);

CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_hnsw
  ON public.knowledge_chunks
  USING hnsw (embedding halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 64)
  WHERE embedding IS NOT NULL;

-- Recria hybrid_search_knowledge com halfvec(1536).
DROP FUNCTION IF EXISTS public.hybrid_search_knowledge(text, vector, uuid, text, text, int, float, float, int);

CREATE OR REPLACE FUNCTION public.hybrid_search_knowledge(
  p_query_text text,
  p_query_embedding halfvec(1536),
  p_agent_id uuid,
  p_tipo text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_match_count int DEFAULT 20,
  p_full_text_weight float DEFAULT 1.0,
  p_semantic_weight float DEFAULT 1.0,
  p_rrf_k int DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  agent_id uuid,
  title text,
  content text,
  category text,
  tipo text,
  tags text[],
  rrf_score double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  WITH base AS (
    SELECT kc.*
    FROM public.knowledge_chunks kc
    WHERE kc.ativo = true
      AND kc.agent_id = p_agent_id
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
  SELECT b.id, b.agent_id, b.title, b.content, b.category, b.tipo, b.tags,
         (coalesce(p_full_text_weight * 1.0 / (p_rrf_k + ft.rnk), 0.0)
        + coalesce(p_semantic_weight * 1.0 / (p_rrf_k + s.rnk), 0.0)) AS rrf_score
  FROM base b
  LEFT JOIN full_text ft ON ft.id = b.id
  LEFT JOIN semantic s ON s.id = b.id
  WHERE ft.id IS NOT NULL OR s.id IS NOT NULL
  ORDER BY rrf_score DESC
  LIMIT p_match_count;
$$;
;
