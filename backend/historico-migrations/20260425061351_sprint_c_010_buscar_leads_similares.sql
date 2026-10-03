
-- Sprint C · Migration 010 · RPC buscar_leads_similares
-- Vector similarity sobre o centroide dos fatos vivos (lead_memory) de cada lead

CREATE OR REPLACE FUNCTION public.buscar_leads_similares(
  p_tenant_id uuid,
  p_lead_id_referencia uuid,
  p_match_count int DEFAULT 10,
  p_min_similarity numeric DEFAULT 0.65
)
RETURNS TABLE (
  lead_id uuid,
  similarity numeric,
  num_fatos int,
  fatos_resumo text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_centroide_ref extensions.vector(1024);
  v_num_fatos_ref int;
BEGIN
  -- Centroide do lead-referência: avg dos embeddings dos fatos vivos
  SELECT
    AVG(embedding)::extensions.vector(1024),
    count(*)
  INTO v_centroide_ref, v_num_fatos_ref
  FROM public.lead_memory
  WHERE tenant_id = p_tenant_id
    AND lead_id = p_lead_id_referencia
    AND ativa = true
    AND system_expired_at IS NULL
    AND embedding IS NOT NULL;

  IF v_centroide_ref IS NULL OR v_num_fatos_ref = 0 THEN
    RETURN; -- referência sem memória embedada → vazio
  END IF;

  RETURN QUERY
  WITH centroides AS (
    SELECT
      lm.lead_id,
      AVG(lm.embedding)::extensions.vector(1024) AS centroide,
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
$$;

REVOKE ALL ON FUNCTION public.buscar_leads_similares(uuid, uuid, int, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.buscar_leads_similares(uuid, uuid, int, numeric) TO authenticated, service_role;

COMMENT ON FUNCTION public.buscar_leads_similares IS 'Sprint C: top-N leads mais similares ao lead-referência via centroide dos embeddings de lead_memory vivos. Base pro Wizard Campanha Semântica.';

;
