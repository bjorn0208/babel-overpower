CREATE OR REPLACE FUNCTION public.busca_hibrida_emocao(p_query_text text, p_query_embedding extensions.halfvec, p_tenant_id uuid DEFAULT NULL::uuid, p_nicho_id uuid DEFAULT NULL::uuid, p_top_k integer DEFAULT 3, p_threshold numeric DEFAULT 0.35, p_intensidade_min numeric DEFAULT 0.0, p_rrf_k integer DEFAULT 50)
 RETURNS TABLE(id uuid, emocao text, corpo text, intensidade_match numeric, escopo text, prioridade integer, score numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  RETURN QUERY
  WITH semantica AS (
    SELECT
      e.id, e.emocao, e.corpo, e.intensidade_match, e.escopo, e.prioridade,
      (1 - (e.vetor_semantico <=> p_query_embedding)::numeric) AS sim,
      ROW_NUMBER() OVER (ORDER BY (e.vetor_semantico <=> p_query_embedding) ASC) AS rank_sem
    FROM public.emocao_blocos e
    WHERE e.ativo = true
      AND e.embedding_status = 'pronto'
      AND e.intensidade_match >= p_intensidade_min
      AND (
        e.escopo = 'global'
        OR (e.escopo = 'nicho' AND p_nicho_id IS NOT NULL AND e.nicho_id = p_nicho_id)
        OR (e.escopo = 'tenant' AND p_tenant_id IS NOT NULL AND e.tenant_id = p_tenant_id)
      )
      AND NOT (
        e.escopo = 'nicho' AND p_tenant_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.overrides_tenant_blocos_emocao ov
                    WHERE ov.bloco_id = e.id AND ov.tenant_id = p_tenant_id AND ov.ativo = false)
      )
    ORDER BY e.vetor_semantico <=> p_query_embedding
    LIMIT 50
  ),
  lexica AS (
    SELECT
      e.id,
      ROW_NUMBER() OVER (ORDER BY ts_rank_cd(to_tsvector('portuguese', coalesce(e.corpo,'') || ' ' || coalesce(e.emocao,'')),
                                              plainto_tsquery('portuguese', p_query_text)) DESC) AS rank_lex
    FROM public.emocao_blocos e
    WHERE e.ativo = true
      AND to_tsvector('portuguese', coalesce(e.corpo,'') || ' ' || coalesce(e.emocao,'')) @@ plainto_tsquery('portuguese', p_query_text)
      AND (
        e.escopo = 'global'
        OR (e.escopo = 'nicho' AND p_nicho_id IS NOT NULL AND e.nicho_id = p_nicho_id)
        OR (e.escopo = 'tenant' AND p_tenant_id IS NOT NULL AND e.tenant_id = p_tenant_id)
      )
      AND NOT (
        e.escopo = 'nicho' AND p_tenant_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.overrides_tenant_blocos_emocao ov
                    WHERE ov.bloco_id = e.id AND ov.tenant_id = p_tenant_id AND ov.ativo = false)
      )
    LIMIT 50
  )
  SELECT
    s.id, s.emocao, s.corpo, s.intensidade_match, s.escopo, s.prioridade,
    (1.0/(p_rrf_k + s.rank_sem) + COALESCE(1.0/(p_rrf_k + l.rank_lex), 0.0))::numeric AS score
  FROM semantica s
  LEFT JOIN lexica l ON l.id = s.id
  WHERE s.sim >= p_threshold
  ORDER BY score DESC
  LIMIT p_top_k;
END;
$function$

