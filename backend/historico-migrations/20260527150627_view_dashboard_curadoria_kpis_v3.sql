-- View: KPIs do dashboard da Curadoria (v3: conversas sem deleted_at)
CREATE OR REPLACE VIEW public.vw_dashboard_curadoria
WITH (security_invoker = true)
AS
WITH parametros AS (
  SELECT
    now() - interval '30 days' AS d30_inicio,
    now() - interval '7 days'  AS d7_inicio,
    now() - interval '24 hours' AS d24_inicio
),
custo_30d AS (
  SELECT
    coalesce(sum(custo_total), 0)::numeric(12,4) AS custo_total_usd,
    count(*)::bigint AS chamadas_total
  FROM public.logs_requisicao_llm, parametros p
  WHERE created_at >= p.d30_inicio
),
conversas_periodo AS (
  SELECT
    count(*) FILTER (WHERE created_at >= p.d24_inicio)::bigint AS conversas_24h,
    count(*) FILTER (WHERE created_at >= p.d7_inicio)::bigint  AS conversas_7d,
    count(*) FILTER (WHERE created_at >= p.d30_inicio)::bigint AS conversas_30d
  FROM public.conversas, parametros p
),
leads_atuais AS (
  SELECT
    count(*) FILTER (WHERE desfecho IS NULL)::bigint            AS leads_ativos,
    count(*) FILTER (WHERE desfecho = 'convertido')::bigint     AS leads_convertidos,
    count(*) FILTER (WHERE desfecho = 'sumido')::bigint         AS leads_sumidos,
    count(*) FILTER (WHERE desfecho = 'recusado')::bigint       AS leads_recusados,
    count(*)::bigint                                            AS leads_total
  FROM public.leads
  WHERE deleted_at IS NULL
),
mensagens_30d AS (
  SELECT
    count(*) FILTER (WHERE role = 'human')::bigint     AS msgs_humano,
    count(*) FILTER (WHERE role = 'assistant')::bigint AS msgs_agente
  FROM public.mensagens, parametros p
  WHERE created_at >= p.d30_inicio
)
SELECT
  c.custo_total_usd,
  c.chamadas_total,
  cp.conversas_24h,
  cp.conversas_7d,
  cp.conversas_30d,
  la.leads_ativos,
  la.leads_convertidos,
  la.leads_sumidos,
  la.leads_recusados,
  la.leads_total,
  CASE
    WHEN (la.leads_convertidos + la.leads_sumidos + la.leads_recusados) > 0
    THEN round(la.leads_convertidos::numeric / (la.leads_convertidos + la.leads_sumidos + la.leads_recusados), 4)
    ELSE 0
  END AS taxa_conversao_global,
  m.msgs_humano,
  m.msgs_agente,
  CASE
    WHEN m.msgs_humano > 0 THEN round(m.msgs_agente::numeric / m.msgs_humano, 2)
    ELSE 0
  END AS msgs_por_humano,
  now() AS calculado_em
FROM custo_30d c, conversas_periodo cp, leads_atuais la, mensagens_30d m;

COMMENT ON VIEW public.vw_dashboard_curadoria IS
  'KPIs agregados pra AbaDashboard. security_invoker=true respeita RLS do user que consulta.';

GRANT SELECT ON public.vw_dashboard_curadoria TO authenticated, service_role;
;
