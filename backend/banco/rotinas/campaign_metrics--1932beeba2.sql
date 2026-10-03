CREATE OR REPLACE FUNCTION public.campaign_metrics(p_tenant_id uuid, p_campaign_id uuid)
 RETURNS TABLE(total_leads integer, leads_por_state jsonb, tempo_medio_minutos_ate_fechamento numeric, taxa_conversao numeric, reproposta_count_total integer, atividade_ultimas_24h integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ SELECT * FROM public.metricas_campanha(p_tenant_id, p_campaign_id) $function$

