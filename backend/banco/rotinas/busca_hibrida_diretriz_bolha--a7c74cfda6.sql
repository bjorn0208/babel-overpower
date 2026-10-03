CREATE OR REPLACE FUNCTION public.busca_hibrida_diretriz_bolha(p_query_text text, p_query_embedding extensions.halfvec, p_tenant_id uuid, p_nicho_id uuid, p_top_k integer DEFAULT 5, p_threshold numeric DEFAULT 0.4, p_rrf_k integer DEFAULT 50, p_fts_weight double precision DEFAULT 1.0, p_sem_weight double precision DEFAULT 1.0)
 RETURNS TABLE(id uuid, contexto text, quantidade_sugerida text, chars_medio_sugerido integer, motivo text, score double precision)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN QUERY
  SELECT db.id,
         db.contexto,
         db.quantidade_sugerida,
         db.chars_medio_sugerido,
         db.motivo,
         9999.0::double precision AS score
  FROM public.diretriz_bolha_blocos db
  WHERE db.ativo = true
    AND db.tag_sempre_ativo = true
    AND (
      db.escopo = 'global'
      OR (db.escopo = 'nicho'  AND db.nicho_id  = p_nicho_id)
      OR (db.escopo = 'tenant' AND db.tenant_id = p_tenant_id)
    )

  UNION ALL

  SELECT f.id, f.contexto, f.quantidade_sugerida, f.chars_medio_sugerido, f.motivo, f.rrf_score
  FROM (
    WITH base AS (
      SELECT db2.id, db2.contexto, db2.quantidade_sugerida, db2.chars_medio_sugerido, db2.motivo, db2.vetor_semantico
      FROM public.diretriz_bolha_blocos db2
      WHERE db2.ativo = true
        AND db2.tag_sempre_ativo = false
        AND (
          db2.escopo = 'global'
          OR (db2.escopo = 'nicho'  AND db2.nicho_id  = p_nicho_id)
          OR (db2.escopo = 'tenant' AND db2.tenant_id = p_tenant_id)
        )
    ),
    full_text AS (
      SELECT b.id,
             ROW_NUMBER() OVER (ORDER BY ts_rank_cd(to_tsvector('portuguese', b.contexto || coalesce(' ' || b.motivo, '')), websearch_to_tsquery('portuguese', p_query_text)) DESC) AS rnk
      FROM base b
      WHERE p_query_text IS NOT NULL AND p_query_text <> ''
        AND to_tsvector('portuguese', b.contexto || coalesce(' ' || b.motivo, '')) @@ websearch_to_tsquery('portuguese', p_query_text)
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
      SELECT b.id, b.contexto, b.quantidade_sugerida, b.chars_medio_sugerido, b.motivo,
             (coalesce(p_fts_weight * 1.0 / (p_rrf_k + ft.rnk), 0.0) + coalesce(p_sem_weight * 1.0 / (p_rrf_k + s.rnk), 0.0))::double precision AS rrf_score
      FROM base b
      LEFT JOIN full_text ft ON ft.id = b.id
      LEFT JOIN semantic   s  ON s.id  = b.id
      WHERE ft.id IS NOT NULL OR s.id IS NOT NULL
    )
    SELECT fused.id, fused.contexto, fused.quantidade_sugerida, fused.chars_medio_sugerido, fused.motivo, fused.rrf_score
    FROM fused
    WHERE fused.rrf_score >= p_threshold::double precision
    ORDER BY fused.rrf_score DESC
    LIMIT p_top_k
  ) f

  ORDER BY score DESC;
END;
$function$

