-- Conflito: parâmetro RETURNS TABLE(lead_id ...) colide com coluna lead_memory.lead_id
-- no SELECT sem alias. Adiciona alias em ambos os SELECT.

CREATE OR REPLACE FUNCTION public.buscar_leads_similares(
  p_tenant_id uuid,
  p_lead_id_referencia uuid,
  p_match_count integer DEFAULT 10,
  p_min_similarity numeric DEFAULT 0.65
)
RETURNS TABLE(lead_id uuid, similarity numeric, num_fatos integer, fatos_resumo text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_centroide_ref extensions.halfvec(1536);
  v_num_fatos_ref int;
BEGIN
  SELECT
    AVG(lm.embedding),
    count(*)
  INTO v_centroide_ref, v_num_fatos_ref
  FROM public.lead_memory lm
  WHERE lm.tenant_id = p_tenant_id
    AND lm.lead_id = p_lead_id_referencia
    AND lm.ativa = true
    AND lm.system_expired_at IS NULL
    AND lm.embedding IS NOT NULL;

  IF v_centroide_ref IS NULL OR v_num_fatos_ref = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH centroides AS (
    SELECT
      lm.lead_id AS lid,
      AVG(lm.embedding) AS centroide,
      count(*)::int AS num_fatos,
      string_agg(lm.fato, ' · ' ORDER BY lm.criado_em DESC) AS fatos_resumo
    FROM public.lead_memory lm
    WHERE lm.tenant_id = p_tenant_id
      AND lm.lead_id <> p_lead_id_referencia
      AND lm.ativa = true
      AND lm.system_expired_at IS NULL
      AND lm.embedding IS NOT NULL
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
$function$;

GRANT EXECUTE ON FUNCTION public.buscar_leads_similares(uuid, uuid, integer, numeric)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.buscar_leads_por_descricao(
  p_tenant_id uuid,
  p_query_embedding extensions.halfvec(1536),
  p_match_count integer DEFAULT 100,
  p_min_similarity numeric DEFAULT 0.6
)
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
      AVG(lm.embedding) AS centroide,
      count(*)::int AS num_fatos,
      string_agg(lm.fato, ' · ' ORDER BY lm.criado_em DESC) AS fatos_resumo
    FROM public.lead_memory lm
    WHERE lm.tenant_id = p_tenant_id
      AND lm.ativa = true
      AND lm.system_expired_at IS NULL
      AND lm.embedding IS NOT NULL
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
$function$;

GRANT EXECUTE ON FUNCTION public.buscar_leads_por_descricao(uuid, extensions.halfvec, integer, numeric)
  TO authenticated, service_role;
;
