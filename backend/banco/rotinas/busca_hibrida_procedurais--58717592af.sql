CREATE OR REPLACE FUNCTION public.busca_hibrida_procedurais(p_query_text text, p_query_embedding extensions.halfvec, p_tenant_id uuid, p_nicho_id uuid, p_top_k integer DEFAULT 5, p_threshold numeric DEFAULT 0.4, p_rrf_k integer DEFAULT 50, p_fts_weight double precision DEFAULT 1.0, p_sem_weight double precision DEFAULT 1.0)
 RETURNS TABLE(id uuid, nome text, passos jsonb, escopo text, score double precision)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT pc.id, pc.nome_procedimento, pc.passos, pc.escopo, pc.vetor_semantico
    FROM public.blocos_procedurais pc
    WHERE pc.ativo = true
      AND pc.deleted_at IS NULL
      AND (
        pc.escopo = 'global'
        OR (pc.escopo = 'nicho'  AND pc.nicho_id  = p_nicho_id)
        OR (pc.escopo = 'tenant' AND pc.tenant_id = p_tenant_id)
      )
      AND NOT (
        pc.escopo = 'nicho' AND p_tenant_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.overrides_tenant_blocos_procedurais ov
                    WHERE ov.bloco_id = pc.id AND ov.tenant_id = p_tenant_id AND ov.ativo = false)
      )
  ),
  full_text AS (
    SELECT b.id,
           ROW_NUMBER() OVER (ORDER BY ts_rank_cd(to_tsvector('portuguese', b.nome_procedimento), websearch_to_tsquery('portuguese', p_query_text)) DESC) AS rnk
    FROM base b
    WHERE p_query_text IS NOT NULL AND p_query_text <> ''
      AND to_tsvector('portuguese', b.nome_procedimento) @@ websearch_to_tsquery('portuguese', p_query_text)
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
    SELECT b.id, b.nome_procedimento, b.passos, b.escopo,
           (coalesce(p_fts_weight * 1.0 / (p_rrf_k + ft.rnk), 0.0) + coalesce(p_sem_weight * 1.0 / (p_rrf_k + s.rnk), 0.0))::double precision AS rrf_score
    FROM base b
    LEFT JOIN full_text ft ON ft.id = b.id
    LEFT JOIN semantic   s  ON s.id  = b.id
    WHERE ft.id IS NOT NULL OR s.id IS NOT NULL
  )
  SELECT f.id, f.nome_procedimento AS nome, f.passos, f.escopo, f.rrf_score
  FROM fused f
  WHERE f.rrf_score >= p_threshold::double precision
  ORDER BY f.rrf_score DESC
  LIMIT p_top_k;
END;
$function$

