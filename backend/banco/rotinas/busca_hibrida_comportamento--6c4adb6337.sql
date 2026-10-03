CREATE OR REPLACE FUNCTION public.busca_hibrida_comportamento(p_query_text text, p_query_embedding extensions.halfvec, p_tenant_id uuid DEFAULT NULL::uuid, p_nicho_id uuid DEFAULT NULL::uuid, p_produto_id uuid DEFAULT NULL::uuid, p_match_count integer DEFAULT 20, p_full_text_weight double precision DEFAULT 1.0, p_semantic_weight double precision DEFAULT 1.0, p_rrf_k integer DEFAULT 50, p_tom text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, escopo text, situacao_descricao text, instrucao text, prioridade integer, tags text[], rrf_score double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  WITH base AS (
    SELECT bc.*
    FROM public.blocos_comportamento bc
    WHERE bc.ativo = true
      AND (
        bc.escopo = 'global'
        OR (bc.escopo = 'nicho'   AND p_nicho_id   IS NOT NULL AND bc.nicho_id   = p_nicho_id)
        OR (bc.escopo = 'tenant'  AND p_tenant_id  IS NOT NULL AND bc.tenant_id  = p_tenant_id)
        OR (bc.escopo = 'produto' AND p_tenant_id  IS NOT NULL AND p_produto_id IS NOT NULL
            AND bc.tenant_id = p_tenant_id AND bc.produto_id = p_produto_id)
      )
      AND NOT (
        bc.escopo = 'nicho'
        AND p_tenant_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.overrides_tenant_blocos_comportamento ov
          WHERE ov.bloco_id = bc.id AND ov.tenant_id = p_tenant_id AND ov.ativo = false
        )
      )
      AND (
        p_tom IS NULL
        OR bc.tags IS NULL
        OR NOT (bc.tags && ARRAY['formal','informal']::text[])
        OR p_tom = ANY(bc.tags)
      )
  ),
  full_text AS (
    SELECT b.id,
           ROW_NUMBER() OVER (
             ORDER BY ts_rank_cd(
               to_tsvector('portuguese', coalesce(b.situacao_descricao,'') || ' ' || coalesce(b.instrucao,'')),
               websearch_to_tsquery('portuguese', p_query_text)
             ) DESC
           ) AS rnk
    FROM base b
    WHERE p_query_text IS NOT NULL AND p_query_text <> ''
      AND to_tsvector('portuguese', coalesce(b.situacao_descricao,'') || ' ' || coalesce(b.instrucao,''))
          @@ websearch_to_tsquery('portuguese', p_query_text)
    LIMIT 60
  ),
  semantic AS (
    SELECT b.id, ROW_NUMBER() OVER (ORDER BY b.vetor_semantico <=> p_query_embedding) AS rnk
    FROM base b
    WHERE b.vetor_semantico IS NOT NULL
    ORDER BY b.vetor_semantico <=> p_query_embedding
    LIMIT 60
  )
  SELECT b.id, b.escopo, b.situacao_descricao, b.instrucao, b.prioridade, b.tags,
         (coalesce(p_full_text_weight * 1.0 / (p_rrf_k + ft.rnk), 0.0)
        + coalesce(p_semantic_weight  * 1.0 / (p_rrf_k + s.rnk),  0.0)) AS rrf_score
  FROM base b
  LEFT JOIN full_text ft ON ft.id = b.id
  LEFT JOIN semantic  s  ON s.id  = b.id
  WHERE ft.id IS NOT NULL OR s.id IS NOT NULL
  ORDER BY rrf_score DESC, b.prioridade DESC NULLS LAST
  LIMIT p_match_count;
$function$

