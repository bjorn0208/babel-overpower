CREATE OR REPLACE FUNCTION public.metricas_campanha(p_tenant_id uuid, p_campaign_id uuid)
 RETURNS TABLE(total_leads integer, leads_por_state jsonb, tempo_medio_minutos_ate_fechamento numeric, taxa_conversao numeric, reproposta_count_total integer, atividade_ultimas_24h integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- Valida tenant ownership
  PERFORM 1 FROM public.campanhas
   WHERE id = p_campaign_id AND tenant_id = p_tenant_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'campaign % não pertence ao tenant %', p_campaign_id, p_tenant_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT * FROM public.leads_campanha
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
$function$

