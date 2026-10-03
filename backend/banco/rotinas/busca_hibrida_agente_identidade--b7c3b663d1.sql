CREATE OR REPLACE FUNCTION public.busca_hibrida_agente_identidade(p_query_text text, p_query_embedding extensions.halfvec, p_agente_id uuid, p_top_k integer DEFAULT 5, p_threshold numeric DEFAULT 0.4, p_rrf_k integer DEFAULT 50, p_fts_weight double precision DEFAULT 1.0, p_sem_weight double precision DEFAULT 1.0)
 RETURNS TABLE(id uuid, dimensao text, texto text, raciocinio text, intensidade numeric, score double precision)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN QUERY
  SELECT ai.id,
         ai.dimensao,
         ai.texto,
         ai.raciocinio,
         ai.intensidade,
         9999.0::double precision AS score
  FROM public.agente_identidade ai
  WHERE ai.agente_id         = p_agente_id
    AND ai.status            = 'ativa'
    AND ai.tenant_desativada = false
    AND (ai.real_world_valid_to IS NULL OR ai.real_world_valid_to > now())
    AND ai.dimensao          = 'motivacao'

  UNION ALL

  SELECT f.id, f.dimensao, f.texto, f.raciocinio, f.intensidade, f.rrf_score
  FROM (
    WITH base AS (
      SELECT ai2.id, ai2.dimensao, ai2.texto, ai2.raciocinio, ai2.intensidade, ai2.vetor_semantico
      FROM public.agente_identidade ai2
      WHERE ai2.agente_id        = p_agente_id
        AND ai2.status           = 'ativa'
        AND ai2.tenant_desativada = false
        AND (ai2.real_world_valid_to IS NULL OR ai2.real_world_valid_to > now())
        AND ai2.dimensao        <> 'motivacao'
    ),
    full_text AS (
      SELECT b.id,
             ROW_NUMBER() OVER (ORDER BY ts_rank_cd(to_tsvector('portuguese', b.dimensao || ' ' || b.texto), websearch_to_tsquery('portuguese', p_query_text)) DESC) AS rnk
      FROM base b
      WHERE p_query_text IS NOT NULL AND p_query_text <> ''
        AND to_tsvector('portuguese', b.dimensao || ' ' || b.texto) @@ websearch_to_tsquery('portuguese', p_query_text)
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
      SELECT b.id, b.dimensao, b.texto, b.raciocinio, b.intensidade,
             (coalesce(p_fts_weight * 1.0 / (p_rrf_k + ft.rnk), 0.0) + coalesce(p_sem_weight * 1.0 / (p_rrf_k + s.rnk), 0.0))::double precision AS rrf_score
      FROM base b
      LEFT JOIN full_text ft ON ft.id = b.id
      LEFT JOIN semantic   s  ON s.id  = b.id
      WHERE ft.id IS NOT NULL OR s.id IS NOT NULL
    )
    SELECT fused.id, fused.dimensao, fused.texto, fused.raciocinio, fused.intensidade, fused.rrf_score
    FROM fused
    WHERE fused.rrf_score >= p_threshold::double precision
    ORDER BY fused.rrf_score DESC
    LIMIT p_top_k
  ) f

  ORDER BY score DESC;
END;
$function$

