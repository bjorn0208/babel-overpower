
-- UP: r01_4_hybrid_search_lead_memory
-- Wave 0 / R01.4 — Busca híbrida (BM25 + cosine + RRF) em lead_memory (Motor Vivo)
-- INVIOLÁVEL: p_lead_id sem DEFAULT — obrigatório no call. Anti-vazamento entre leads.
-- search_path TO 'public', 'extensions' — padrão das RPCs vetoriais do projeto

CREATE OR REPLACE FUNCTION public.hybrid_search_lead_memory(
  p_lead_id            uuid,                              -- OBRIGATÓRIO sem default
  p_query_text         text,
  p_query_embedding    halfvec,
  p_match_count        integer          DEFAULT 5,
  p_full_text_weight   double precision DEFAULT 1.0,
  p_semantic_weight    double precision DEFAULT 1.0,
  p_rrf_k              integer          DEFAULT 50
)
RETURNS TABLE(
  id         uuid,
  fato       text,
  categoria  text,
  relevancia text,
  score      double precision
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
  -- Busca híbrida BM25 + cosine com RRF, filtrada por lead_id (anti-LGPD-break).
  -- Filtro duplo: lead_id = p_lead_id AND tenant_id = auth.uid().
  -- keyword: full-text BM25 sobre campo fato em português.
  -- semantic: similaridade cosine via operador <=>.
  -- RRF funde os rankings: score = w_bm25/(k+rank_bm25) + w_sem/(k+rank_sem).
  WITH keyword AS (
    SELECT lm.id,
           row_number() OVER (
             ORDER BY ts_rank(
               to_tsvector('portuguese', lm.fato),
               plainto_tsquery('portuguese', p_query_text)
             ) DESC
           ) AS rank_k
    FROM public.lead_memory lm
    WHERE lm.lead_id   = p_lead_id
      AND lm.tenant_id = (select auth.uid())
      AND lm.ativa     = true
      AND lm.embedding_status = 'ready'
      AND to_tsvector('portuguese', lm.fato)
          @@ plainto_tsquery('portuguese', p_query_text)
    LIMIT p_match_count * 2
  ),
  semantic AS (
    SELECT lm.id,
           row_number() OVER (ORDER BY lm.embedding <=> p_query_embedding ASC) AS rank_s
    FROM public.lead_memory lm
    WHERE lm.lead_id   = p_lead_id
      AND lm.tenant_id = (select auth.uid())
      AND lm.ativa     = true
      AND lm.embedding_status = 'ready'
    ORDER BY lm.embedding <=> p_query_embedding ASC
    LIMIT p_match_count * 2
  )
  SELECT
    lm.id,
    lm.fato,
    lm.categoria,
    lm.relevancia,
    COALESCE(p_full_text_weight * (1.0 / (p_rrf_k + k.rank_k)), 0.0)
    + COALESCE(p_semantic_weight * (1.0 / (p_rrf_k + s.rank_s)), 0.0) AS score
  FROM public.lead_memory lm
  LEFT JOIN keyword  k ON k.id = lm.id
  LEFT JOIN semantic s ON s.id = lm.id
  WHERE lm.lead_id   = p_lead_id
    AND lm.tenant_id = (select auth.uid())
    AND lm.ativa     = true
    AND (k.id IS NOT NULL OR s.id IS NOT NULL)
  ORDER BY score DESC
  LIMIT p_match_count;
$$;

COMMENT ON FUNCTION public.hybrid_search_lead_memory(uuid, text, halfvec, integer, double precision, double precision, integer) IS
  'Busca híbrida BM25 + cosine com RRF em lead_memory (R01.4 — Motor Vivo). '
  'p_lead_id OBRIGATÓRIO sem default — anti-vazamento de memória entre leads (LGPD). '
  'Filtro duplo: lead_id = p_lead_id AND tenant_id = auth.uid(). '
  '6ª fonte do retrieve-router: injetada no prompt como bloco <memoria_lead>.';

GRANT EXECUTE ON FUNCTION public.hybrid_search_lead_memory(uuid, text, halfvec, integer, double precision, double precision, integer)
  TO authenticated, service_role;

;
