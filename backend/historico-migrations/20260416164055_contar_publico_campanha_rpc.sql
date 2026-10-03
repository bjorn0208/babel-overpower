CREATE OR REPLACE FUNCTION public.contar_publico_campanha(
  p_tenant_id uuid,
  p_type text,
  p_filters jsonb,
  p_inatividade_ms bigint
) RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_count integer;
  v_corte timestamptz;
BEGIN
  v_corte := now() - make_interval(secs => (p_inatividade_ms::numeric / 1000)::double precision);

  IF p_type = 'cobranca' THEN
    SELECT COUNT(DISTINCT l.id) INTO v_count
    FROM public.leads l
    JOIN public.client_payments cp ON cp.lead_id = l.id AND cp.status = 'pendente' AND cp.data_vencimento < CURRENT_DATE
    LEFT JOIN public.campaign_leads cl ON cl.lead_id = l.id AND cl.state = 'ativo'
    LEFT JOIN public.tenant_opt_outs o ON o.lead_id = l.id AND o.tenant_id = p_tenant_id
    WHERE l.tenant_id = p_tenant_id
      AND cl.id IS NULL
      AND o.id IS NULL;
    RETURN v_count;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.leads l
  LEFT JOIN public.campaign_leads cl ON cl.lead_id = l.id AND cl.state = 'ativo'
  LEFT JOIN public.tenant_opt_outs o ON o.lead_id = l.id AND o.tenant_id = p_tenant_id
  WHERE l.tenant_id = p_tenant_id
    AND l.updated_at < v_corte
    AND cl.id IS NULL
    AND o.id IS NULL
    AND (
      p_filters->'tags' IS NULL
      OR jsonb_array_length(p_filters->'tags') = 0
      OR (
        (p_filters->>'operator' = 'OR' AND l.tags && ARRAY(SELECT jsonb_array_elements_text(p_filters->'tags')))
        OR (COALESCE(p_filters->>'operator', 'AND') = 'AND' AND l.tags @> ARRAY(SELECT jsonb_array_elements_text(p_filters->'tags')))
      )
    );
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.contar_publico_campanha(uuid, text, jsonb, bigint) TO authenticated;
;
