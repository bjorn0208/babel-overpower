-- Trocar security_invoker → security_definer pra view de agregação
-- (security_definer = executa como owner=postgres, sem RLS por tabela; mais rápido e seguro pra view só de agregados)
ALTER VIEW public.vw_dashboard_curadoria SET (security_invoker = false);
ALTER VIEW public.vw_cerebro_kpis_1h SET (security_invoker = false);
ALTER VIEW public.vw_cerebro_turnos_recentes SET (security_invoker = false);
ALTER VIEW public.vw_dashboard_top_gavetas SET (security_invoker = false);
ALTER VIEW public.vw_dashboard_serie_30d SET (security_invoker = false);
ALTER VIEW public.vw_heatmap_humor_7d SET (security_invoker = false);
;
