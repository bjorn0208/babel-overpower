-- View 1: top gavetas acionadas nos últimos 30d
-- Conta cada key do jsonb prompts_turno.blocos com valor não-vazio
CREATE OR REPLACE VIEW public.vw_dashboard_top_gavetas
WITH (security_invoker = true)
AS
WITH chaves AS (
  SELECT jsonb_object_keys(blocos) AS chave, blocos
  FROM public.prompts_turno
  WHERE blocos IS NOT NULL
    AND criado_em >= now() - interval '30 days'
)
SELECT
  chave AS gaveta,
  count(*) AS acionamentos
FROM chaves
WHERE coalesce(blocos ->> chave, '') <> ''
GROUP BY chave
ORDER BY acionamentos DESC
LIMIT 12;

COMMENT ON VIEW public.vw_dashboard_top_gavetas IS
  'Top gavetas acionadas em prompts_turno últimos 30d. Conta chaves do jsonb blocos com valor não-vazio.';

GRANT SELECT ON public.vw_dashboard_top_gavetas TO authenticated, service_role;

-- View 2: conversas/dia últimos 30d (série temporal pro gráfico)
CREATE OR REPLACE VIEW public.vw_dashboard_serie_30d
WITH (security_invoker = true)
AS
WITH dias AS (
  SELECT generate_series(
    (now() - interval '29 days')::date,
    now()::date,
    interval '1 day'
  )::date AS dia
)
SELECT
  d.dia,
  coalesce(c.qtd, 0)::int AS conversas
FROM dias d
LEFT JOIN (
  SELECT date_trunc('day', created_at)::date AS dia, count(*) AS qtd
  FROM public.conversas
  WHERE created_at >= now() - interval '30 days'
  GROUP BY 1
) c ON c.dia = d.dia
ORDER BY d.dia;

COMMENT ON VIEW public.vw_dashboard_serie_30d IS
  'Conversas criadas por dia últimos 30d (com zeros nos dias sem conversa).';

GRANT SELECT ON public.vw_dashboard_serie_30d TO authenticated, service_role;

-- View 3: turnos recentes do cérebro (substitui mock da AbaCerebro)
CREATE OR REPLACE VIEW public.vw_cerebro_turnos_recentes
WITH (security_invoker = true)
AS
SELECT
  t.id,
  t.criado_em,
  t.lead_id,
  t.tenant_id,
  t.modelo_llm,
  t.tipo::text AS tipo,
  t.latencia_ms,
  t.custo_tokens_in,
  t.custo_tokens_out,
  t.confianca,
  c.nome AS cargo_nome,
  l.name AS lead_nome,
  -- normaliza custo aproximado USD (ajustar quando tivermos preço por modelo)
  CASE
    WHEN t.modelo_llm ILIKE '%gemini-2.5-pro%' THEN ((coalesce(t.custo_tokens_in,0) * 1.25e-6) + (coalesce(t.custo_tokens_out,0) * 5e-6))
    WHEN t.modelo_llm ILIKE '%gemini-2.5-flash-lite%' THEN ((coalesce(t.custo_tokens_in,0) * 7.5e-8) + (coalesce(t.custo_tokens_out,0) * 3e-7))
    WHEN t.modelo_llm ILIKE '%gemini%flash%' THEN ((coalesce(t.custo_tokens_in,0) * 7.5e-8) + (coalesce(t.custo_tokens_out,0) * 3e-7))
    WHEN t.modelo_llm ILIKE '%gpt-4o-mini%' THEN ((coalesce(t.custo_tokens_in,0) * 1.5e-7) + (coalesce(t.custo_tokens_out,0) * 6e-7))
    WHEN t.modelo_llm ILIKE '%gpt-4o%' THEN ((coalesce(t.custo_tokens_in,0) * 2.5e-6) + (coalesce(t.custo_tokens_out,0) * 1e-5))
    ELSE ((coalesce(t.custo_tokens_in,0) * 5e-7) + (coalesce(t.custo_tokens_out,0) * 1.5e-6))
  END AS custo_usd_estimado
FROM public.traces t
LEFT JOIN public.cargos c ON c.id = t.cargo_id
LEFT JOIN public.leads l ON l.id = t.lead_id
WHERE t.criado_em >= now() - interval '24 hours'
ORDER BY t.criado_em DESC
LIMIT 100;

COMMENT ON VIEW public.vw_cerebro_turnos_recentes IS
  'Últimos 100 traces das últimas 24h pra AbaCerebro. Custo USD estimado por modelo até existir tabela de preços.';

GRANT SELECT ON public.vw_cerebro_turnos_recentes TO authenticated, service_role;

-- View 4: KPIs agregados do cérebro últimas N horas (configurável via parameter? por ora 1h)
CREATE OR REPLACE VIEW public.vw_cerebro_kpis_1h
WITH (security_invoker = true)
AS
WITH base AS (
  SELECT
    t.latencia_ms,
    t.modelo_llm,
    CASE
      WHEN t.modelo_llm ILIKE '%gemini-2.5-pro%' THEN ((coalesce(t.custo_tokens_in,0) * 1.25e-6) + (coalesce(t.custo_tokens_out,0) * 5e-6))
      WHEN t.modelo_llm ILIKE '%gemini%' THEN ((coalesce(t.custo_tokens_in,0) * 7.5e-8) + (coalesce(t.custo_tokens_out,0) * 3e-7))
      WHEN t.modelo_llm ILIKE '%gpt-4o-mini%' THEN ((coalesce(t.custo_tokens_in,0) * 1.5e-7) + (coalesce(t.custo_tokens_out,0) * 6e-7))
      WHEN t.modelo_llm ILIKE '%gpt-4o%' THEN ((coalesce(t.custo_tokens_in,0) * 2.5e-6) + (coalesce(t.custo_tokens_out,0) * 1e-5))
      ELSE ((coalesce(t.custo_tokens_in,0) * 5e-7) + (coalesce(t.custo_tokens_out,0) * 1.5e-6))
    END AS custo_usd
  FROM public.traces t
  WHERE t.criado_em >= now() - interval '1 hour'
)
SELECT
  count(*)::int AS turnos_hora,
  coalesce(percentile_disc(0.5) WITHIN GROUP (ORDER BY latencia_ms), 0)::int AS latencia_p50_ms,
  coalesce(percentile_disc(0.95) WITHIN GROUP (ORDER BY latencia_ms), 0)::int AS latencia_p95_ms,
  coalesce(sum(custo_usd), 0)::numeric(12,4) AS custo_hora_usd,
  now() AS calculado_em
FROM base;

COMMENT ON VIEW public.vw_cerebro_kpis_1h IS
  'KPIs do motor última hora: turnos, p50/p95 latência, custo total USD estimado.';

GRANT SELECT ON public.vw_cerebro_kpis_1h TO authenticated, service_role;
;
