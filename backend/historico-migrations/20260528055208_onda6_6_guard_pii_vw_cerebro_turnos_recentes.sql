-- ============================================================================
-- Onda 6.6 — Guard PII em vw_cerebro_turnos_recentes
-- Hoje: security_invoker=false + JOIN leads expõe lead_nome cross-tenant
-- Fix: filtrar tenant explicitamente + reativar security_invoker (defesa em profundidade)
-- ============================================================================

DROP VIEW IF EXISTS public.vw_cerebro_turnos_recentes;

CREATE VIEW public.vw_cerebro_turnos_recentes
WITH (security_invoker = true) AS
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
  CASE
    WHEN t.modelo_llm ILIKE '%gemini-2.5-pro%' THEN COALESCE(t.custo_tokens_in, 0)::numeric * 0.00000125 + COALESCE(t.custo_tokens_out, 0)::numeric * 0.000005
    WHEN t.modelo_llm ILIKE '%gemini-2.5-flash-lite%' THEN COALESCE(t.custo_tokens_in, 0)::numeric * 0.000000075 + COALESCE(t.custo_tokens_out, 0)::numeric * 0.0000003
    WHEN t.modelo_llm ILIKE '%gemini%flash%' THEN COALESCE(t.custo_tokens_in, 0)::numeric * 0.000000075 + COALESCE(t.custo_tokens_out, 0)::numeric * 0.0000003
    WHEN t.modelo_llm ILIKE '%gpt-4o-mini%' THEN COALESCE(t.custo_tokens_in, 0)::numeric * 0.00000015 + COALESCE(t.custo_tokens_out, 0)::numeric * 0.0000006
    WHEN t.modelo_llm ILIKE '%gpt-4o%' THEN COALESCE(t.custo_tokens_in, 0)::numeric * 0.0000025 + COALESCE(t.custo_tokens_out, 0)::numeric * 0.00001
    ELSE COALESCE(t.custo_tokens_in, 0)::numeric * 0.0000005 + COALESCE(t.custo_tokens_out, 0)::numeric * 0.0000015
  END AS custo_usd_estimado
FROM traces t
  LEFT JOIN cargos c ON c.id = t.cargo_id
  LEFT JOIN leads l ON l.id = t.lead_id
WHERE t.criado_em >= (now() - '24:00:00'::interval)
  -- guard PII: admin/platform_admin vê tudo; tenant vê só o seu
  AND (
    EXISTS (SELECT 1 FROM public.user_roles ur 
            WHERE ur.user_id = (SELECT auth.uid()) 
              AND ur.role IN ('admin','platform_admin'))
    OR t.tenant_id = (SELECT auth.uid())
  )
ORDER BY t.criado_em DESC
LIMIT 100;

GRANT SELECT ON public.vw_cerebro_turnos_recentes TO authenticated;

;
