CREATE OR REPLACE FUNCTION public.busca_hibrida_memoria_lead_v2(p_lead_id uuid, p_query_text text, p_query_embedding extensions.halfvec, p_match_count integer DEFAULT 30, p_full_text_weight double precision DEFAULT 1.0, p_semantic_weight double precision DEFAULT 1.0, p_rrf_k integer DEFAULT 50, p_tenant_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, fato text, categoria text, relevancia text, confianca numeric, criado_em timestamp with time zone, ultima_evocacao_em timestamp with time zone, vezes_evocado integer, valencia_emocional numeric, confirmado_pelo_lead boolean, valido_desde timestamp with time zone, score double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  WITH base AS (
    SELECT lm.*
    FROM public.memoria_lead lm
    WHERE lm.lead_id          = p_lead_id
      AND lm.tenant_id        = public.tenant_efetivo(p_tenant_id)
      AND lm.ativa            = true
      AND lm.embedding_status = 'pronto'
      AND lm.fonte            != 'teste'
      AND (lm.valido_ate         IS NULL OR lm.valido_ate         > now())
      AND (lm.sistema_expirou_em IS NULL OR lm.sistema_expirou_em > now())
  ),
  keyword AS (
    SELECT b.id,
           row_number() OVER (
             ORDER BY ts_rank(to_tsvector('portuguese', b.fato), plainto_tsquery('portuguese', p_query_text)) DESC
           ) AS rank_k
    FROM base b
    WHERE to_tsvector('portuguese', b.fato) @@ plainto_tsquery('portuguese', p_query_text)
    LIMIT p_match_count * 2
  ),
  semantic AS (
    SELECT b.id,
           row_number() OVER (ORDER BY b.vetor_semantico <=> p_query_embedding ASC) AS rank_s
    FROM base b
    ORDER BY b.vetor_semantico <=> p_query_embedding ASC
    LIMIT p_match_count * 2
  )
  SELECT
    b.id, b.fato, b.categoria, b.relevancia, b.confianca, b.criado_em,
    b.ultima_evocacao_em, b.vezes_evocado, b.valencia_emocional, b.confirmado_pelo_lead,
    b.valido_desde,
    (
      ( COALESCE(p_full_text_weight * (1.0 / (p_rrf_k + k.rank_k)), 0.0)
      + COALESCE(p_semantic_weight * (1.0 / (p_rrf_k + s.rank_s)), 0.0) )
      * power(COALESCE(b.confianca, 0.5), 0.6)
    ) AS score
  FROM base b
  LEFT JOIN keyword  k ON k.id = b.id
  LEFT JOIN semantic s ON s.id = b.id
  WHERE (k.id IS NOT NULL OR s.id IS NOT NULL)
  ORDER BY score DESC
  LIMIT p_match_count;
$function$

