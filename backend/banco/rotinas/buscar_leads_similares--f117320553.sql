CREATE OR REPLACE FUNCTION public.buscar_leads_similares(p_tenant_id uuid, p_lead_id_referencia uuid, p_match_count integer DEFAULT 10, p_min_similarity numeric DEFAULT 0.65)
 RETURNS TABLE(lead_id uuid, similarity numeric, num_fatos integer, fatos_resumo text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_centroide_ref extensions.halfvec;
  v_num_fatos_ref int;
BEGIN
  SELECT
    AVG(lm.vetor_semantico),
    count(*)
  INTO v_centroide_ref, v_num_fatos_ref
  FROM public.memoria_lead lm
  WHERE lm.tenant_id = p_tenant_id
    AND lm.lead_id = p_lead_id_referencia
    AND lm.ativa = true
    AND lm.sistema_expirou_em IS NULL
    AND lm.vetor_semantico IS NOT NULL;

  IF v_centroide_ref IS NULL OR v_num_fatos_ref = 0 THEN
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
      AND lm.lead_id <> p_lead_id_referencia
      AND lm.ativa = true
      AND lm.sistema_expirou_em IS NULL
      AND lm.vetor_semantico IS NOT NULL
    GROUP BY lm.lead_id
    HAVING count(*) > 0
  )
  SELECT
    c.lid,
    (1 - (c.centroide <=> v_centroide_ref))::numeric,
    c.num_fatos,
    LEFT(c.fatos_resumo, 500)
  FROM centroides c
  WHERE (1 - (c.centroide <=> v_centroide_ref)) >= p_min_similarity
  ORDER BY c.centroide <=> v_centroide_ref ASC
  LIMIT p_match_count;
END;
$function$

