CREATE OR REPLACE FUNCTION public.busca_hibrida_humanizacao(p_query_text text, p_query_embedding extensions.halfvec, p_tenant_id uuid DEFAULT NULL::uuid, p_nicho_id uuid DEFAULT NULL::uuid, p_persona_tags text[] DEFAULT NULL::text[], p_match_count integer DEFAULT 10, p_full_text_weight double precision DEFAULT 1.0, p_semantic_weight double precision DEFAULT 1.0, p_rrf_k integer DEFAULT 50)
 RETURNS TABLE(id uuid, categoria text, subcategoria text, regra text, exemplos_bons text[], exemplos_ruins text[], contexto_uso text, quando_nao_usar text, tags_persona text[], escopo text, prioridade integer, rrf_score double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  WITH base AS (
    SELECT hc.* FROM public.blocos_humanizacao hc WHERE hc.ativo = true
      AND (hc.escopo='global'
        OR (hc.escopo='nicho' AND p_nicho_id IS NOT NULL AND hc.nicho_id=p_nicho_id)
        OR (hc.escopo='tenant' AND p_tenant_id IS NOT NULL AND hc.tenant_id=p_tenant_id))
      AND NOT (
        hc.escopo='nicho' AND p_tenant_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.overrides_tenant_blocos_humanizacao ov
                    WHERE ov.bloco_id=hc.id AND ov.tenant_id=p_tenant_id AND ov.ativo=false)
      )
      AND (p_persona_tags IS NULL OR array_length(p_persona_tags,1) IS NULL OR hc.tags_persona && p_persona_tags)
  ),
  full_text AS (
    SELECT b.id, ROW_NUMBER() OVER (ORDER BY ts_rank_cd(
      to_tsvector('portuguese', coalesce(b.regra,'')||' '||coalesce(b.contexto_uso,'')),
      websearch_to_tsquery('portuguese', p_query_text)) DESC) AS rnk
    FROM base b WHERE p_query_text IS NOT NULL AND p_query_text <> ''
      AND to_tsvector('portuguese', coalesce(b.regra,'')||' '||coalesce(b.contexto_uso,''))
          @@ websearch_to_tsquery('portuguese', p_query_text)
    LIMIT 40
  ),
  semantic AS (
    SELECT b.id, ROW_NUMBER() OVER (ORDER BY b.vetor_semantico <=> p_query_embedding) AS rnk
    FROM base b WHERE b.vetor_semantico IS NOT NULL
    ORDER BY b.vetor_semantico <=> p_query_embedding LIMIT 40
  )
  SELECT b.id, b.categoria, b.subcategoria, b.regra, b.exemplos_bons, b.exemplos_ruins,
    b.contexto_uso, b.quando_nao_usar, b.tags_persona, b.escopo, b.prioridade,
    (coalesce(p_full_text_weight*1.0/(p_rrf_k+ft.rnk),0.0)+coalesce(p_semantic_weight*1.0/(p_rrf_k+s.rnk),0.0)) AS rrf_score
  FROM base b LEFT JOIN full_text ft ON ft.id=b.id LEFT JOIN semantic s ON s.id=b.id
  WHERE ft.id IS NOT NULL OR s.id IS NOT NULL
  ORDER BY rrf_score DESC, b.prioridade DESC NULLS LAST LIMIT p_match_count;
$function$

