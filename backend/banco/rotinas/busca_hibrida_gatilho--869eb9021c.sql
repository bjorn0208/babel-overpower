CREATE OR REPLACE FUNCTION public.busca_hibrida_gatilho(p_query_text text, p_query_embedding extensions.halfvec, p_tenant_id uuid DEFAULT NULL::uuid, p_nicho_id uuid DEFAULT NULL::uuid, p_match_count integer DEFAULT 5, p_full_text_weight double precision DEFAULT 1.0, p_semantic_weight double precision DEFAULT 1.0, p_rrf_k integer DEFAULT 50)
 RETURNS TABLE(id uuid, nome_trigger text, exemplo_frase text, acao_disparada text, acao_payload jsonb, escopo text, rrf_score double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  WITH base AS (
    SELECT tc.* FROM public.blocos_gatilho tc WHERE tc.ativo = true
      AND (tc.escopo='global'
        OR (tc.escopo='nicho' AND p_nicho_id IS NOT NULL AND tc.nicho_id=p_nicho_id)
        OR (tc.escopo='tenant' AND p_tenant_id IS NOT NULL AND tc.tenant_id=p_tenant_id))
      AND NOT (
        tc.escopo='nicho' AND p_tenant_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.overrides_tenant_blocos_gatilho ov
                    WHERE ov.bloco_id=tc.id AND ov.tenant_id=p_tenant_id AND ov.ativo=false)
      )
  ),
  full_text AS (
    SELECT b.id, ROW_NUMBER() OVER (ORDER BY ts_rank_cd(
      to_tsvector('portuguese', coalesce(b.nome_trigger,'')||' '||coalesce(b.exemplo_frase,'')),
      websearch_to_tsquery('portuguese', p_query_text)) DESC) AS rnk
    FROM base b WHERE p_query_text IS NOT NULL AND p_query_text <> ''
      AND to_tsvector('portuguese', coalesce(b.nome_trigger,'')||' '||coalesce(b.exemplo_frase,''))
          @@ websearch_to_tsquery('portuguese', p_query_text)
    LIMIT 30
  ),
  semantic AS (
    SELECT b.id, ROW_NUMBER() OVER (ORDER BY b.vetor_semantico <=> p_query_embedding) AS rnk
    FROM base b WHERE b.vetor_semantico IS NOT NULL
    ORDER BY b.vetor_semantico <=> p_query_embedding LIMIT 30
  )
  SELECT b.id, b.nome_trigger, b.exemplo_frase, b.acao_disparada, b.acao_payload, b.escopo,
    (coalesce(p_full_text_weight*1.0/(p_rrf_k+ft.rnk),0.0)+coalesce(p_semantic_weight*1.0/(p_rrf_k+s.rnk),0.0)) AS rrf_score
  FROM base b LEFT JOIN full_text ft ON ft.id=b.id LEFT JOIN semantic s ON s.id=b.id
  WHERE ft.id IS NOT NULL OR s.id IS NOT NULL
  ORDER BY rrf_score DESC LIMIT p_match_count;
$function$

