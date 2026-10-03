CREATE OR REPLACE FUNCTION public.busca_hibrida_emocao_blocos(p_query_text text, p_query_embedding extensions.halfvec, p_tenant_id uuid, p_nicho_id uuid, p_top_k integer DEFAULT 5, p_threshold numeric DEFAULT 0.4, p_rrf_k integer DEFAULT 50, p_fts_weight double precision DEFAULT 1.0, p_sem_weight double precision DEFAULT 1.0)
 RETURNS TABLE(id uuid, emocao text, intensidade_match numeric, corpo text, exemplos jsonb, escopo text, score double precision)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT ec.id, ec.emocao, ec.intensidade_match, ec.corpo, ec.exemplos, ec.escopo, ec.vetor_semantico
    FROM public.emocao_blocos ec
    WHERE ec.ativo = true
      AND (
        ec.escopo = 'global'
        OR (ec.escopo = 'nicho'  AND ec.nicho_id  = p_nicho_id)
        OR (ec.escopo = 'tenant' AND ec.tenant_id = p_tenant_id)
      )
  ),
  full_text AS (
    SELECT b.id,
           ROW_NUMBER() OVER (ORDER BY ts_rank_cd(to_tsvector('portuguese', b.emocao || ' ' || b.corpo), websearch_to_tsquery('portuguese', p_query_text)) DESC) AS rnk
    FROM base b
    WHERE p_query_text IS NOT NULL AND p_query_text <> ''
      AND to_tsvector('portuguese', b.emocao || ' ' || b.corpo) @@ websearch_to_tsquery('portuguese', p_query_text)
    LIMIT 60
  ),
  semantic AS (
    SELECT b.id,
           ROW_NUMBER() OVER (ORDER BY b.vetor_semantico <=> p_query_embedding) AS rnk
    FROM base b
    WHERE b.vetor_semantico IS NOT NULL
    ORDER BY b.vetor_semantico <=> p_query_embedding
    LIMIT 60
  ),
  fused AS (
    SELECT b.id, b.emocao, b.intensidade_match, b.corpo, b.exemplos, b.escopo,
           (coalesce(p_fts_weight * 1.0 / (p_rrf_k + ft.rnk), 0.0) + coalesce(p_sem_weight * 1.0 / (p_rrf_k + s.rnk), 0.0))::double precision AS rrf_score
    FROM base b
    LEFT JOIN full_text ft ON ft.id = b.id
    LEFT JOIN semantic   s  ON s.id  = b.id
    WHERE ft.id IS NOT NULL OR s.id IS NOT NULL
  )
  SELECT f.id, f.emocao, f.intensidade_match, f.corpo, f.exemplos, f.escopo, f.rrf_score
  FROM fused f
  WHERE f.rrf_score >= p_threshold::double precision
  ORDER BY f.rrf_score DESC
  LIMIT p_top_k;
END;
$function$

