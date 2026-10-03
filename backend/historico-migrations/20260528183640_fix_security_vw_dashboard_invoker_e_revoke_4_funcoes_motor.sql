-- Fix segurança rodada 2 da re-auditoria.
--
-- (a) vw_dashboard_curadoria: era security_invoker=false (=SECURITY DEFINER),
--     ERROR cravado pelo advisor (security_definer_view). Troca pra true pra
--     respeitar RLS do user que faz SELECT (consumida pelo AbaDashboard admin).
--
-- (b) REVOKE EXECUTE de authenticated/anon nas 4 funções SECURITY DEFINER que
--     são chamadas só por edges via service_role (não pelo client):
--       - busca_hibrida_emocao (motor RAG)
--       - preencher_perfil_empresa_prior (trigger interna)
--       - promover_blocos_cross_nicho (cron admin)
--       - recalcular_pesos_gavetas_tenant (cron/admin)
--
-- Não toca em ativar/pausar/togglar/listar (chamadas pela UI admin) — essas
-- precisam de gate role admin/platform_admin em onda dedicada. Fica como
-- follow-up registrado no md de operação.

ALTER VIEW public.vw_dashboard_curadoria SET (security_invoker = true);

REVOKE EXECUTE ON FUNCTION public.busca_hibrida_emocao(
  p_query_text text, p_query_embedding halfvec, p_tenant_id uuid, p_nicho_id uuid,
  p_top_k integer, p_threshold numeric, p_intensidade_min numeric, p_rrf_k integer
) FROM authenticated, anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.busca_hibrida_emocao(
  p_query_text text, p_query_embedding halfvec, p_tenant_id uuid, p_nicho_id uuid,
  p_top_k integer, p_threshold numeric, p_intensidade_min numeric, p_rrf_k integer
) TO service_role;

REVOKE EXECUTE ON FUNCTION public.preencher_perfil_empresa_prior() FROM authenticated, anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.preencher_perfil_empresa_prior() TO service_role;

REVOKE EXECUTE ON FUNCTION public.promover_blocos_cross_nicho() FROM authenticated, anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.promover_blocos_cross_nicho() TO service_role;

REVOKE EXECUTE ON FUNCTION public.recalcular_pesos_gavetas_tenant(p_tenant_id uuid) FROM authenticated, anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.recalcular_pesos_gavetas_tenant(p_tenant_id uuid) TO service_role;
;
