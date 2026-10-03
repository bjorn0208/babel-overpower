CREATE OR REPLACE FUNCTION public.obter_metricas_campanha(p_campaign_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_caller uuid := auth.uid(); v_tenant uuid; v_ativos integer; v_fechados integer; v_desistentes integer; v_repropostas integer; v_proximos jsonb;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT tenant_id INTO v_tenant FROM public.campanhas WHERE id = p_campaign_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT (v_tenant = v_caller OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_caller AND p.parent_user_id = v_tenant) OR public.is_platform_admin()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT COUNT(*) FILTER (WHERE state = 'ativo' AND archived_at IS NULL),
         COUNT(*) FILTER (WHERE state = 'fechado' AND archived_at IS NULL),
         COUNT(*) FILTER (WHERE state = 'desistente' AND archived_at IS NULL)
  INTO v_ativos, v_fechados, v_desistentes FROM public.leads_campanha WHERE campaign_id = p_campaign_id;
  SELECT COUNT(*) INTO v_repropostas FROM public.repropostas_lead_campanha clr
  JOIN public.leads_campanha cl ON cl.id = clr.campaign_lead_id WHERE cl.campaign_id = p_campaign_id;
  SELECT COALESCE(jsonb_agg(rows ORDER BY rows->>'scheduled_at' ASC), '[]'::jsonb) INTO v_proximos
  FROM (SELECT jsonb_build_object('id', sa.id, 'lead_id', sa.lead_id, 'action_type', sa.action_type, 'scheduled_at', sa.scheduled_at) AS rows
    FROM public.acoes_agendadas sa WHERE sa.campaign_id = p_campaign_id AND sa.status IN ('pending','pendente') AND sa.action_type LIKE 'campaign%'
    ORDER BY sa.scheduled_at ASC LIMIT 10) t;
  RETURN jsonb_build_object('ativos', v_ativos, 'fechados', v_fechados, 'desistentes', v_desistentes, 'repropostas', v_repropostas, 'proximos_10', v_proximos);
END;
$function$

