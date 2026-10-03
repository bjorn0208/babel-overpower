CREATE OR REPLACE FUNCTION public.busca_hibrida_memoria_lead(p_lead_id uuid, p_query_text text, p_query_embedding extensions.halfvec, p_match_count integer DEFAULT 5, p_full_text_weight double precision DEFAULT 1.0, p_semantic_weight double precision DEFAULT 1.0, p_rrf_k integer DEFAULT 50, p_tenant_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, fato text, categoria text, relevancia text, score double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  WITH keyword AS (
    SELECT lm.id,
           row_number() OVER (
             ORDER BY ts_rank(to_tsvector('portuguese', lm.fato), plainto_tsquery('portuguese', p_query_text)) DESC
           ) AS rank_k
    FROM public.memoria_lead lm
    WHERE lm.lead_id          = p_lead_id
      AND lm.tenant_id        = public.tenant_efetivo(p_tenant_id)
      AND lm.ativa            = true
      AND lm.embedding_status = 'pronto'
      AND lm.fonte            != 'teste'
      AND to_tsvector('portuguese', lm.fato) @@ plainto_tsquery('portuguese', p_query_text)
    LIMIT p_match_count * 2
  ),
  semantic AS (
    SELECT lm.id,
           row_number() OVER (ORDER BY lm.vetor_semantico <=> p_query_embedding ASC) AS rank_s
    FROM public.memoria_lead lm
    WHERE lm.lead_id          = p_lead_id
      AND lm.tenant_id        = public.tenant_efetivo(p_tenant_id)
      AND lm.ativa            = true
      AND lm.embedding_status = 'pronto'
      AND lm.fonte            != 'teste'
    ORDER BY lm.vetor_semantico <=> p_query_embedding ASC
    LIMIT p_match_count * 2
  )
  SELECT
    lm.id,
    lm.fato,
    lm.categoria,
    lm.relevancia,
    COALESCE(p_full_text_weight * (1.0 / (p_rrf_k + k.rank_k)), 0.0)
    + COALESCE(p_semantic_weight * (1.0 / (p_rrf_k + s.rank_s)), 0.0) AS score
  FROM public.memoria_lead lm
  LEFT JOIN keyword  k ON k.id = lm.id
  LEFT JOIN semantic s ON s.id = lm.id
  WHERE lm.lead_id          = p_lead_id
    AND lm.tenant_id        = public.tenant_efetivo(p_tenant_id)
    AND lm.ativa            = true
    AND lm.fonte            != 'teste'
    AND (k.id IS NOT NULL OR s.id IS NOT NULL)
  ORDER BY score DESC
  LIMIT p_match_count;
$function$

