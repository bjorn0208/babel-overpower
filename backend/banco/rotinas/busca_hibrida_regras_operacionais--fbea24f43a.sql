CREATE OR REPLACE FUNCTION public.busca_hibrida_regras_operacionais(p_query_text text, p_query_embedding extensions.halfvec, p_categoria text DEFAULT NULL::text, p_tenant_id uuid DEFAULT NULL::uuid, p_nicho_id uuid DEFAULT NULL::uuid, p_top_k integer DEFAULT 5, p_threshold numeric DEFAULT 0.40, p_rrf_k integer DEFAULT 50, p_fts_weight double precision DEFAULT 1.0, p_sem_weight double precision DEFAULT 1.0)
 RETURNS TABLE(id uuid, categoria text, contexto text, regra text, parametros jsonb, prioridade integer, escopo text, score double precision)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT
      r.id,
      r.categoria,
      r.contexto,
      r.regra,
      r.parametros,
      r.prioridade,
      r.escopo,
      r.vetor_semantico
    FROM public.regras_operacionais_blocos r
    WHERE r.ativo = true
      AND (p_categoria IS NULL OR r.categoria = p_categoria)
      AND (
        r.escopo = 'global'
        OR (r.escopo = 'nicho'  AND r.nicho_id  = p_nicho_id)
        OR (r.escopo = 'tenant' AND r.tenant_id = p_tenant_id)
      )
  ),
  full_text AS (
    SELECT b.id,
           ROW_NUMBER() OVER (
             ORDER BY ts_rank_cd(
               to_tsvector('portuguese', b.contexto || ' ' || b.regra),
               websearch_to_tsquery('portuguese', p_query_text)
             ) DESC
           ) AS rnk
    FROM base b
    WHERE p_query_text IS NOT NULL AND p_query_text <> ''
      AND to_tsvector('portuguese', b.contexto || ' ' || b.regra)
          @@ websearch_to_tsquery('portuguese', p_query_text)
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
    SELECT
      b.id,
      b.categoria,
      b.contexto,
      b.regra,
      b.parametros,
      b.prioridade,
      b.escopo,
      (
        coalesce(p_fts_weight * 1.0 / (p_rrf_k + ft.rnk), 0.0) +
        coalesce(p_sem_weight * 1.0 / (p_rrf_k + s.rnk),  0.0) +
        b.prioridade::float * 0.001
      )::double precision AS rrf_score
    FROM base b
    LEFT JOIN full_text ft ON ft.id = b.id
    LEFT JOIN semantic   s  ON s.id  = b.id
    WHERE ft.id IS NOT NULL OR s.id IS NOT NULL
  )
  SELECT
    f.id,
    f.categoria,
    f.contexto,
    f.regra,
    f.parametros,
    f.prioridade,
    f.escopo,
    f.rrf_score AS score
  FROM fused f
  WHERE f.rrf_score >= p_threshold::double precision
  ORDER BY f.rrf_score DESC
  LIMIT p_top_k;
END;
$function$

