CREATE OR REPLACE FUNCTION public.busca_hibrida_memoria_episodica(p_query_text text, p_query_embedding extensions.halfvec, p_tenant_id uuid, p_lead_id uuid DEFAULT NULL::uuid, p_match_count integer DEFAULT 5, p_full_text_weight double precision DEFAULT 1.0, p_semantic_weight double precision DEFAULT 1.0, p_rrf_k integer DEFAULT 50)
 RETURNS TABLE(id uuid, episodio_resumo text, outcome text, emocao text, gancho text, score double precision, decay_factor numeric, criado_em timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  WITH base AS (
    SELECT em.id, em.episodio_resumo, em.outcome, em.emocao, em.gancho,
           em.vetor_semantico, em.decay_factor, em.criado_em
    FROM public.memoria_episodica em
    WHERE em.ativa = true
      AND em.tenant_id = p_tenant_id
      AND (p_lead_id IS NULL OR em.lead_id = p_lead_id)
  ),
  full_text AS (
    SELECT b.id,
           row_number() OVER (
             ORDER BY ts_rank_cd(
               to_tsvector('portuguese', b.episodio_resumo || coalesce(' ' || b.gancho, '')),
               websearch_to_tsquery('portuguese', p_query_text)
             ) DESC
           ) AS rnk
    FROM base b
    WHERE p_query_text IS NOT NULL AND p_query_text <> ''
      AND to_tsvector('portuguese', b.episodio_resumo || coalesce(' ' || b.gancho, ''))
          @@ websearch_to_tsquery('portuguese', p_query_text)
    LIMIT 60
  ),
  semantic AS (
    SELECT b.id,
           row_number() OVER (ORDER BY b.vetor_semantico <=> p_query_embedding) AS rnk
    FROM base b
    WHERE b.vetor_semantico IS NOT NULL
    ORDER BY b.vetor_semantico <=> p_query_embedding
    LIMIT 60
  ),
  fused AS (
    SELECT b.id, b.episodio_resumo, b.outcome, b.emocao, b.gancho, b.decay_factor, b.criado_em,
           (coalesce(p_full_text_weight * 1.0 / (p_rrf_k + ft.rnk), 0.0)
            + coalesce(p_semantic_weight * 1.0 / (p_rrf_k + s.rnk), 0.0))::double precision AS rrf_score
    FROM base b
    LEFT JOIN full_text ft ON ft.id = b.id
    LEFT JOIN semantic   s  ON s.id  = b.id
    WHERE ft.id IS NOT NULL OR s.id IS NOT NULL
  )
  SELECT f.id, f.episodio_resumo, f.outcome, f.emocao, f.gancho,
         (f.rrf_score * coalesce(f.decay_factor, 1.0))::double precision AS score,
         f.decay_factor, f.criado_em
  FROM fused f
  ORDER BY f.rrf_score * coalesce(f.decay_factor, 1.0) DESC
  LIMIT p_match_count;
$function$

