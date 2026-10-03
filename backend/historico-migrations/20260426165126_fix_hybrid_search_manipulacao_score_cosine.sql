CREATE OR REPLACE FUNCTION public.hybrid_search_manipulacao(
  p_query_text text,
  p_query_embedding extensions.halfvec,
  p_tenant_id uuid,
  p_nicho_id uuid,
  p_top_k integer DEFAULT 5,
  p_threshold numeric DEFAULT 0.65,
  p_rrf_k integer DEFAULT 50,
  p_fts_weight double precision DEFAULT 1.0,
  p_sem_weight double precision DEFAULT 1.0
)
RETURNS TABLE(id uuid, tipo text, severidade text, exemplos jsonb, resposta_padrao text, score double precision)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT mc.id, mc.tipo, mc.severidade, mc.exemplos, mc.resposta_padrao, mc.embedding
    FROM public.manipulacao_chunks mc
    WHERE mc.ativo = true
      AND mc.escopo = 'global'
  ),
  scored AS (
    SELECT b.id, b.tipo, b.severidade, b.exemplos, b.resposta_padrao,
           CASE
             WHEN b.embedding IS NOT NULL
               THEN (1 - (b.embedding <=> p_query_embedding))::double precision
             ELSE 0.0
           END AS sim_cosine,
           CASE
             WHEN p_query_text IS NOT NULL
              AND p_query_text <> ''
              AND to_tsvector('portuguese',
                    coalesce(b.tipo, '') || ' ' ||
                    coalesce(b.resposta_padrao, '') || ' ' ||
                    coalesce(b.exemplos::text, '')
                  ) @@ websearch_to_tsquery('portuguese', p_query_text)
               THEN ts_rank_cd(
                 to_tsvector('portuguese',
                   coalesce(b.tipo, '') || ' ' ||
                   coalesce(b.resposta_padrao, '') || ' ' ||
                   coalesce(b.exemplos::text, '')
                 ),
                 websearch_to_tsquery('portuguese', p_query_text)
               )::double precision
             ELSE 0.0
           END AS fts_rank
    FROM base b
  )
  SELECT s.id, s.tipo, s.severidade, s.exemplos, s.resposta_padrao,
         -- Score final = similarity cosine pura (0-1) com pequeno boost de FTS quando casa.
         -- Mantém compatibilidade com threshold 0.65 (escala cosine).
         GREATEST(s.sim_cosine, LEAST(s.sim_cosine + (s.fts_rank * 0.15), 1.0))::double precision AS score
  FROM scored s
  WHERE GREATEST(s.sim_cosine, LEAST(s.sim_cosine + (s.fts_rank * 0.15), 1.0)) >= p_threshold::double precision
  ORDER BY score DESC
  LIMIT p_top_k;
END;
$function$;
;
