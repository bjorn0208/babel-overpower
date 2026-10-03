CREATE OR REPLACE FUNCTION public.buscar_leads_por_descricao(p_tenant_id uuid, p_query_embedding extensions.halfvec, p_match_count integer DEFAULT 100, p_min_similarity numeric DEFAULT 0.6)
 RETURNS TABLE(lead_id uuid, similarity numeric, num_fatos integer, fatos_resumo text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF p_query_embedding IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH centroides AS (
    SELECT
      lm.lead_id AS lid,
      AVG(lm.vetor_semantico) AS centroide,
      count(*)::int AS num_fatos,
      string_agg(lm.fato, ' · ' ORDER BY lm.criado_em DESC) AS fatos_resumo
    FROM public.memoria_lead lm
    WHERE lm.tenant_id = p_tenant_id
      AND lm.ativa = true
      AND lm.sistema_expirou_em IS NULL
      AND lm.vetor_semantico IS NOT NULL
    GROUP BY lm.lead_id
    HAVING count(*) > 0
  )
  SELECT
    c.lid,
    (1 - (c.centroide <=> p_query_embedding))::numeric,
    c.num_fatos,
    LEFT(c.fatos_resumo, 500)
  FROM centroides c
  WHERE (1 - (c.centroide <=> p_query_embedding)) >= p_min_similarity
  ORDER BY c.centroide <=> p_query_embedding ASC
  LIMIT p_match_count;
END;
$function$

