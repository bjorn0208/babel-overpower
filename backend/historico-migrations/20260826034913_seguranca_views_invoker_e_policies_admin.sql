-- Correções dos advisors de segurança (26/08/2026):
-- 1. As 6 views SECURITY DEFINER expostas na API deixavam QUALQUER usuário
--    autenticado ler dados de todos os tenants (agentes_usuario era filtrada
--    só no cliente). Viram security_invoker → RLS das tabelas-fonte manda.
-- 2. conversas e estado_afetivo_lead não tinham leitura de super admin (as
--    demais fontes têm eh_super_admin nas policies) — sem isso, os dashboards
--    do Admin (serie_30d/heatmap) ficariam vazios com invoker. Policies
--    adicionadas no MESMO padrão das existentes (OR com as de tenant).
-- 3. fn_sanitizar_resposta_mentor sem search_path fixo (lint) — cravado.

alter view public.agentes_usuario set (security_invoker = true);
alter view public.vw_dashboard_top_gavetas set (security_invoker = true);
alter view public.vw_dashboard_serie_30d set (security_invoker = true);
alter view public.vw_cerebro_kpis_1h set (security_invoker = true);
alter view public.vw_gatilhos_reativos set (security_invoker = true);
alter view public.vw_heatmap_humor_7d set (security_invoker = true);

drop policy if exists conversas_admin_le on public.conversas;
create policy conversas_admin_le on public.conversas
  for select using (eh_super_admin((select auth.uid())));

drop policy if exists estado_afetivo_admin_le on public.estado_afetivo_lead;
create policy estado_afetivo_admin_le on public.estado_afetivo_lead
  for select using (eh_super_admin((select auth.uid())));

alter function public.fn_sanitizar_resposta_mentor() set search_path = '';
;
