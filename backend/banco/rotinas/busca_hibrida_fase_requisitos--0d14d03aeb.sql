CREATE OR REPLACE FUNCTION public.busca_hibrida_fase_requisitos(p_query_text text, p_query_embedding extensions.halfvec, p_fase text, p_agent_id uuid DEFAULT NULL::uuid, p_tenant_id uuid DEFAULT NULL::uuid, p_nicho_id uuid DEFAULT NULL::uuid, p_produto_id uuid DEFAULT NULL::uuid, p_match_count integer DEFAULT 10, p_full_text_weight double precision DEFAULT 1.0, p_semantic_weight double precision DEFAULT 1.0, p_rrf_k integer DEFAULT 50)
 RETURNS TABLE(id uuid, descricao_curta text, descricao_semantica text, obrigatorio boolean, evidencias jsonb, escopo text, ordem integer, rrf_score double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  WITH base AS (
    SELECT fr.* FROM public.fase_requisitos fr
    WHERE fr.ativo = true AND fr.fase = p_fase
      AND (fr.escopo = 'global'
        OR (fr.escopo = 'nicho'    AND p_nicho_id   IS NOT NULL AND fr.nicho_id   = p_nicho_id)
        OR (fr.escopo = 'tenant'   AND p_tenant_id  IS NOT NULL AND fr.tenant_id  = p_tenant_id)
        OR (fr.escopo = 'produto'  AND p_produto_id IS NOT NULL AND fr.produto_id = p_produto_id)
        OR (fr.escopo = 'agente'   AND p_agent_id   IS NOT NULL AND fr.agente_id  = p_agent_id))
  ),
  full_text AS (
    SELECT b.id, ROW_NUMBER() OVER (
      ORDER BY ts_rank_cd(to_tsvector('portuguese', coalesce(b.descricao_curta, '') || ' ' || coalesce(b.descricao_semantica, '')),
                         websearch_to_tsquery('portuguese', p_query_text)) DESC) AS rnk
    FROM base b
    WHERE p_query_text IS NOT NULL AND p_query_text <> ''
      AND to_tsvector('portuguese', coalesce(b.descricao_curta, '') || ' ' || coalesce(b.descricao_semantica, '')) @@ websearch_to_tsquery('portuguese', p_query_text)
    LIMIT 30
  ),
  semantic AS (
    SELECT b.id, ROW_NUMBER() OVER (ORDER BY b.vetor_semantico <=> p_query_embedding) AS rnk
    FROM base b WHERE b.vetor_semantico IS NOT NULL ORDER BY b.vetor_semantico <=> p_query_embedding LIMIT 30
  )
  SELECT b.id, b.descricao_curta, b.descricao_semantica, b.obrigatorio, b.evidencias, b.escopo, b.ordem,
         (coalesce(p_full_text_weight * 1.0 / (p_rrf_k + ft.rnk), 0.0) + coalesce(p_semantic_weight * 1.0 / (p_rrf_k + s.rnk), 0.0)) AS rrf_score
  FROM base b LEFT JOIN full_text ft ON ft.id = b.id LEFT JOIN semantic s ON s.id = b.id
  WHERE ft.id IS NOT NULL OR s.id IS NOT NULL ORDER BY rrf_score DESC LIMIT p_match_count;
$function$

