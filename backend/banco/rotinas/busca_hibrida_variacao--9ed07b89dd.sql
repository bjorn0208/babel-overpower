CREATE OR REPLACE FUNCTION public.busca_hibrida_variacao(p_query_text text, p_query_embedding extensions.halfvec, p_agent_id uuid DEFAULT NULL::uuid, p_nicho_id uuid DEFAULT NULL::uuid, p_tenant_id uuid DEFAULT NULL::uuid, p_match_count integer DEFAULT 10, p_rrf_k integer DEFAULT 50, p_categoria text DEFAULT NULL::text, p_tags text[] DEFAULT NULL::text[])
 RETURNS TABLE(id uuid, nome_variation text, instrucao text, categoria text, subcategoria text, escopo text, prioridade integer, rrf_score double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  WITH base AS (
    SELECT vc.*
    FROM public.blocos_variacao vc
    WHERE vc.ativo = true
      AND (
        vc.escopo = 'global'
        OR (vc.escopo = 'nicho'  AND p_nicho_id  IS NOT NULL AND vc.nicho_id  = p_nicho_id)
        OR (vc.escopo = 'tenant' AND p_tenant_id IS NOT NULL AND vc.tenant_id = p_tenant_id)
      )
      AND NOT (
        vc.escopo = 'nicho' AND p_tenant_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.overrides_tenant_blocos_variacao ov
                    WHERE ov.bloco_id=vc.id AND ov.tenant_id=p_tenant_id AND ov.ativo=false)
      )
      AND (p_categoria IS NULL OR vc.categoria = p_categoria)
      AND (p_tags      IS NULL OR array_length(p_tags, 1) IS NULL OR vc.subcategoria = ANY(p_tags))
  ),
  full_text AS (
    SELECT b.id,
           ROW_NUMBER() OVER (
             ORDER BY ts_rank_cd(
               to_tsvector('portuguese', coalesce(b.nome_variation, '') || ' ' || coalesce(b.instrucao, '')),
               websearch_to_tsquery('portuguese', p_query_text)
             ) DESC
           ) AS rnk
    FROM base b
    WHERE p_query_text IS NOT NULL AND p_query_text <> ''
      AND to_tsvector('portuguese', coalesce(b.nome_variation, '') || ' ' || coalesce(b.instrucao, ''))
          @@ websearch_to_tsquery('portuguese', p_query_text)
    LIMIT 40
  ),
  semantic AS (
    SELECT b.id,
           ROW_NUMBER() OVER (ORDER BY b.vetor_semantico <=> p_query_embedding) AS rnk
    FROM base b
    WHERE b.vetor_semantico IS NOT NULL
    ORDER BY b.vetor_semantico <=> p_query_embedding
    LIMIT 40
  )
  SELECT
    b.id, b.nome_variation, b.instrucao, b.categoria, b.subcategoria, b.escopo, b.prioridade,
    (coalesce(1.0 / (p_rrf_k + ft.rnk), 0.0) + coalesce(1.0 / (p_rrf_k + s.rnk), 0.0)) AS rrf_score
  FROM base b
  LEFT JOIN full_text ft ON ft.id = b.id
  LEFT JOIN semantic  s  ON s.id  = b.id
  WHERE ft.id IS NOT NULL OR s.id IS NOT NULL
  ORDER BY rrf_score DESC, b.prioridade DESC NULLS LAST
  LIMIT p_match_count;
$function$

