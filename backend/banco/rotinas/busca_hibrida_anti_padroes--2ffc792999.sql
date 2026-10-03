CREATE OR REPLACE FUNCTION public.busca_hibrida_anti_padroes(p_query_text text, p_query_embedding extensions.halfvec, p_tenant_id uuid, p_nicho_id uuid, p_top_k integer DEFAULT 5, p_threshold numeric DEFAULT 0.4, p_rrf_k integer DEFAULT 50, p_fts_weight double precision DEFAULT 1.0, p_sem_weight double precision DEFAULT 1.0, p_tipo_campanha text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, situacao text, acao_correta text, por_que text, escopo text, score double precision)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT ap.id, ap.situacao, ap.acao_correta, ap.por_que, ap.escopo, ap.vetor_semantico
    FROM public.anti_padroes ap
    WHERE ap.ativo = true
      AND (ap.real_world_valid_to IS NULL OR ap.real_world_valid_to > now())
      AND (p_tipo_campanha IS NULL OR ap.tipo_campanha = p_tipo_campanha)
      AND (
        ap.escopo = 'global'
        OR (ap.escopo = 'nicho'  AND ap.nicho_id  = p_nicho_id)
        OR (ap.escopo = 'tenant' AND ap.tenant_id = p_tenant_id)
      )
      AND NOT (
        ap.escopo = 'nicho' AND p_tenant_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.overrides_tenant_blocos_anti_padroes ov
                    WHERE ov.bloco_id = ap.id AND ov.tenant_id = p_tenant_id AND ov.ativo = false)
      )
  ),
  full_text AS (
    SELECT b.id,
           ROW_NUMBER() OVER (ORDER BY ts_rank_cd(to_tsvector('portuguese', b.situacao || ' ' || b.acao_correta), websearch_to_tsquery('portuguese', p_query_text)) DESC) AS rnk
    FROM base b
    WHERE p_query_text IS NOT NULL AND p_query_text <> ''
      AND to_tsvector('portuguese', b.situacao || ' ' || b.acao_correta) @@ websearch_to_tsquery('portuguese', p_query_text)
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
    SELECT b.id, b.situacao, b.acao_correta, b.por_que, b.escopo,
           (coalesce(p_fts_weight * 1.0 / (p_rrf_k + ft.rnk), 0.0) + coalesce(p_sem_weight * 1.0 / (p_rrf_k + s.rnk), 0.0))::double precision AS rrf_score
    FROM base b
    LEFT JOIN full_text ft ON ft.id = b.id
    LEFT JOIN semantic   s  ON s.id  = b.id
    WHERE ft.id IS NOT NULL OR s.id IS NOT NULL
  )
  SELECT f.id, f.situacao, f.acao_correta, f.por_que, f.escopo, f.rrf_score
  FROM fused f
  WHERE f.rrf_score >= p_threshold::double precision
  ORDER BY f.rrf_score DESC
  LIMIT p_top_k;
END;
$function$

