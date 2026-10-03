-- FASE 0 · corrige herança default de SECURITY DEFINER em view.
-- View precisa rodar com permissão do invocador (platform_admin/service_role) pra RLS do llm_request_logs valer.

DROP VIEW IF EXISTS public.v_belief_taxa;

CREATE VIEW public.v_belief_taxa
WITH (security_invoker = true)
AS
SELECT
  date_trunc('hour', created_at) AS hora,
  COUNT(*) AS total_turnos,
  COUNT(*) FILTER (WHERE (metadata->>'belief_devolvido')::boolean = true) AS belief_ok,
  COUNT(*) FILTER (WHERE metadata->>'motivo_falha' = 'parsed_ausente') AS falha_parsed_ausente,
  COUNT(*) FILTER (WHERE metadata->>'motivo_falha' = 'zod_falhou') AS falha_zod,
  COUNT(*) FILTER (WHERE metadata->>'motivo_falha' = 'sem_tenant') AS falha_sem_tenant,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE (metadata->>'belief_devolvido')::boolean = true)
    / NULLIF(COUNT(*), 0),
    2
  ) AS pct_ok
FROM public.llm_request_logs
WHERE tipo = 'chat'
  AND created_at > now() - interval '7 days'
  AND metadata ? 'belief_devolvido'
GROUP BY 1
ORDER BY 1 DESC;

COMMENT ON VIEW public.v_belief_taxa IS 'FASE 0 · taxa horária de belief_devolvido. security_invoker=true aplica RLS do invocador. Meta: pct_ok ≥ 80% em 24h.';
;
