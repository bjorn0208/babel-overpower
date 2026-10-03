-- Fix RPC buscar_leads_similares: cast vector(1024) -> halfvec(1536)
-- Padrão da plataforma é halfvec(1536) (lead_memory.embedding) + Cohere embed-v4.0.
-- O cast antigo pra extensions.vector(1024) era bug latente do Sprint C.
-- AVG(halfvec) é nativo no pgvector 0.8.0 e retorna halfvec.
CREATE OR REPLACE FUNCTION public.buscar_leads_similares(
  p_tenant_id uuid,
  p_lead_id_referencia uuid,
  p_match_count integer DEFAULT 10,
  p_min_similarity numeric DEFAULT 0.65
)
RETURNS TABLE(lead_id uuid, similarity numeric, num_fatos integer, fatos_resumo text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_centroide_ref extensions.halfvec(1536);
  v_num_fatos_ref int;
BEGIN
  SELECT
    AVG(embedding)::extensions.halfvec(1536),
    count(*)
  INTO v_centroide_ref, v_num_fatos_ref
  FROM public.lead_memory
  WHERE tenant_id = p_tenant_id
    AND lead_id = p_lead_id_referencia
    AND ativa = true
    AND system_expired_at IS NULL
    AND embedding IS NOT NULL;

  IF v_centroide_ref IS NULL OR v_num_fatos_ref = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH centroides AS (
    SELECT
      lm.lead_id,
      AVG(lm.embedding)::extensions.halfvec(1536) AS centroide,
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
    c.lead_id,
    (1 - (c.centroide <=> v_centroide_ref))::numeric AS similarity,
    c.num_fatos,
    LEFT(c.fatos_resumo, 500) AS fatos_resumo
  FROM centroides c
  WHERE (1 - (c.centroide <=> v_centroide_ref)) >= p_min_similarity
  ORDER BY c.centroide <=> v_centroide_ref ASC
  LIMIT p_match_count;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.buscar_leads_similares(uuid, uuid, integer, numeric)
  TO authenticated, service_role;

-- RPC nova buscar_leads_por_descricao
-- Modo C do Wizard Campanha Semântica: dono escreve descrição em pt-BR,
-- edge fn embed-persona-campanha embeda via Cohere embed-v4.0 (input_type=search_query, dim 1536),
-- chama esta RPC com o vetor pronto. Cosine entre embedding da descrição e centroide
-- dos fatos vivos por lead (mesmo padrão de buscar_leads_similares mas vetor externo).
-- INVIOLÁVEL: WHERE tenant_id = p_tenant_id em todo SELECT (zero cross-tenant).
CREATE OR REPLACE FUNCTION public.buscar_leads_por_descricao(
  p_tenant_id uuid,
  p_query_embedding extensions.halfvec(1536),
  p_match_count integer DEFAULT 100,
  p_min_similarity numeric DEFAULT 0.6
)
RETURNS TABLE(lead_id uuid, similarity numeric, num_fatos integer, fatos_resumo text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF p_query_embedding IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH centroides AS (
    SELECT
      lm.lead_id,
      AVG(lm.embedding)::extensions.halfvec(1536) AS centroide,
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
    c.lead_id,
    (1 - (c.centroide <=> p_query_embedding))::numeric AS similarity,
    c.num_fatos,
    LEFT(c.fatos_resumo, 500) AS fatos_resumo
  FROM centroides c
  WHERE (1 - (c.centroide <=> p_query_embedding)) >= p_min_similarity
  ORDER BY c.centroide <=> p_query_embedding ASC
  LIMIT p_match_count;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.buscar_leads_por_descricao(uuid, extensions.halfvec, integer, numeric)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.buscar_leads_por_descricao(uuid, extensions.halfvec, integer, numeric) IS
  'Wizard Campanha Semântica Modo C: recebe embedding da descrição em pt-BR (Cohere embed-v4.0, halfvec 1536) e retorna leads cujo centroide das memórias casa via cosine. Tenant scoped — sem cross-tenant.';
;
