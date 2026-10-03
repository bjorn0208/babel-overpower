CREATE OR REPLACE FUNCTION public.busca_hibrida_acao_pausa(p_query text, p_query_embedding extensions.halfvec, p_tenant_id uuid, p_nicho_id uuid DEFAULT NULL::uuid, p_match_count integer DEFAULT 5, p_full_text_weight double precision DEFAULT 1.0, p_semantic_weight double precision DEFAULT 1.5, p_rrf_k integer DEFAULT 50)
 RETURNS TABLE(id uuid, escopo text, gatilho_descricao text, gatilho_falas jsonb, duracao_min integer, mensagem_retorno text, prioridade integer, similarity double precision, rrf_score double precision)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN QUERY
  WITH full_text AS (
    SELECT a.id,
      row_number() OVER (
        ORDER BY ts_rank_cd(
          to_tsvector('portuguese',
            coalesce(a.gatilho_descricao,'') || ' ' ||
            coalesce(a.gatilho_falas::text,'')
          ),
          websearch_to_tsquery('portuguese', p_query)
        ) DESC
      ) AS rank
    FROM public.acao_pausa_blocos a
    WHERE a.ativo = true
      AND (
        a.escopo = 'global'
        OR (a.escopo = 'nicho' AND a.nicho_id = p_nicho_id)
        OR (a.escopo = 'tenant' AND a.tenant_id = p_tenant_id)
      )
      AND to_tsvector('portuguese',
        coalesce(a.gatilho_descricao,'') || ' ' ||
        coalesce(a.gatilho_falas::text,'')
      ) @@ websearch_to_tsquery('portuguese', p_query)
    LIMIT p_match_count * 2
  ),
  semantic AS (
    SELECT a.id,
      row_number() OVER (ORDER BY a.vetor_semantico <=> p_query_embedding) AS rank,
      1 - (a.vetor_semantico <=> p_query_embedding) AS sim
    FROM public.acao_pausa_blocos a
    WHERE a.ativo = true
      AND a.vetor_semantico IS NOT NULL
      AND (
        a.escopo = 'global'
        OR (a.escopo = 'nicho' AND a.nicho_id = p_nicho_id)
        OR (a.escopo = 'tenant' AND a.tenant_id = p_tenant_id)
      )
    ORDER BY a.vetor_semantico <=> p_query_embedding
    LIMIT p_match_count * 2
  )
  SELECT
    a.id,
    a.escopo,
    a.gatilho_descricao,
    a.gatilho_falas,
    a.duracao_min,
    a.mensagem_retorno,
    a.prioridade,
    coalesce(s.sim, 0)::float AS similarity,
    (
      coalesce(1.0 / (p_rrf_k + ft.rank), 0) * p_full_text_weight +
      coalesce(1.0 / (p_rrf_k + s.rank), 0) * p_semantic_weight
    )::float AS rrf_score
  FROM public.acao_pausa_blocos a
  LEFT JOIN full_text ft ON ft.id = a.id
  LEFT JOIN semantic  s  ON s.id = a.id
  WHERE ft.id IS NOT NULL OR s.id IS NOT NULL
  ORDER BY rrf_score DESC
  LIMIT p_match_count;
END;
$function$

