-- Limpeza Geral v1.0 - Onda D (hardening de seguranca)
-- Aplica security_invoker=true nas 8 views remanescentes do schema public.
-- Padrao oficial confirmado em duas views ja convertidas (v_belief_taxa, v_ficha_form_valores_atual).
-- Risco baixo: views deixam de executar como dono e passam a respeitar RLS do caller.

ALTER VIEW public.v_compromissos_agente SET (security_invoker = true);
ALTER VIEW public.v_conversas_status_dia SET (security_invoker = true);
ALTER VIEW public.v_custo_por_modelo_dia SET (security_invoker = true);
ALTER VIEW public.v_gargalos_campanha_tenant SET (security_invoker = true);
ALTER VIEW public.v_leads_por_fase_tenant SET (security_invoker = true);
ALTER VIEW public.v_profile_health SET (security_invoker = true);
ALTER VIEW public.v_saude_cronjobs SET (security_invoker = true);
ALTER VIEW public.v_top_erros_dia SET (security_invoker = true);

;
