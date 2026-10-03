
-- Item #5 ALTERAÇÕES.md · campaign_metrics + bulk_update_campaign_leads

CREATE OR REPLACE FUNCTION public.campaign_metrics(
  p_tenant_id uuid,
  p_campaign_id uuid
)
RETURNS TABLE (
  total_leads int,
  leads_por_state jsonb,
  tempo_medio_minutos_ate_fechamento numeric,
  taxa_conversao numeric,
  reproposta_count_total int,
  atividade_ultimas_24h int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Valida tenant ownership
  PERFORM 1 FROM public.campaigns
   WHERE id = p_campaign_id AND tenant_id = p_tenant_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'campaign % não pertence ao tenant %', p_campaign_id, p_tenant_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT * FROM public.campaign_leads
     WHERE campaign_id = p_campaign_id
       AND archived_at IS NULL
  )
  SELECT
    (SELECT count(*)::int FROM base) AS total_leads,
    (
      SELECT coalesce(jsonb_object_agg(state, c), '{}'::jsonb)
        FROM (SELECT state, count(*) AS c FROM base GROUP BY state) s
    ) AS leads_por_state,
    (
      SELECT round(avg(EXTRACT(EPOCH FROM (closed_at - entered_at)) / 60)::numeric, 2)
        FROM base WHERE closed_at IS NOT NULL
    ) AS tempo_medio_minutos_ate_fechamento,
    (
      SELECT CASE WHEN count(*) = 0 THEN 0
                  ELSE round((count(*) FILTER (WHERE state = 'fechado'))::numeric / count(*) * 100, 2)
             END
        FROM base
    ) AS taxa_conversao,
    (SELECT coalesce(sum(reproposta_count), 0)::int FROM base) AS reproposta_count_total,
    (SELECT count(*)::int FROM base WHERE last_contact_at > now() - interval '24 hours') AS atividade_ultimas_24h;
END;
$$;

REVOKE ALL ON FUNCTION public.campaign_metrics(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.campaign_metrics(uuid, uuid) TO authenticated, service_role;

-- Bulk update — pausar/reativar/arquivar leads em massa
CREATE OR REPLACE FUNCTION public.bulk_update_campaign_leads(
  p_tenant_id uuid,
  p_campaign_id uuid,
  p_lead_ids uuid[],
  p_acao text
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_afetados int := 0;
BEGIN
  IF p_acao NOT IN ('pausar','reativar','arquivar') THEN
    RAISE EXCEPTION 'ação inválida: %. Aceitas: pausar|reativar|arquivar', p_acao
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Valida tenant ownership
  PERFORM 1 FROM public.campaigns
   WHERE id = p_campaign_id AND tenant_id = p_tenant_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'campaign % não pertence ao tenant %', p_campaign_id, p_tenant_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_acao = 'pausar' THEN
    UPDATE public.campaign_leads
       SET state = 'pausado'
     WHERE id = ANY(p_lead_ids) AND campaign_id = p_campaign_id;
  ELSIF p_acao = 'reativar' THEN
    UPDATE public.campaign_leads
       SET state = 'ativo'
     WHERE id = ANY(p_lead_ids) AND campaign_id = p_campaign_id AND state = 'pausado';
  ELSIF p_acao = 'arquivar' THEN
    UPDATE public.campaign_leads
       SET archived_at = now()
     WHERE id = ANY(p_lead_ids) AND campaign_id = p_campaign_id AND archived_at IS NULL;
  END IF;

  GET DIAGNOSTICS v_afetados = ROW_COUNT;
  RETURN v_afetados;
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_update_campaign_leads(uuid, uuid, uuid[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bulk_update_campaign_leads(uuid, uuid, uuid[], text) TO authenticated, service_role;

COMMENT ON FUNCTION public.campaign_metrics IS 'Item #5 ALTERAÇÕES: agregados de uma campanha pra dashboard Esteira.';
COMMENT ON FUNCTION public.bulk_update_campaign_leads IS 'Item #5 ALTERAÇÕES: ações em massa (pausar/reativar/arquivar) sobre leads de uma campanha.';

;
