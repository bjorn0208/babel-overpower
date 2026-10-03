CREATE OR REPLACE FUNCTION public.excluir_campanha(p_campaign_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_caller uuid := auth.uid(); v_tenant uuid; v_is_admin boolean; v_is_team_member boolean;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT tenant_id INTO v_tenant FROM public.campanhas WHERE id = p_campaign_id AND deleted_at IS NULL;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  v_is_admin := public.is_platform_admin();
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_caller AND p.parent_user_id = v_tenant) INTO v_is_team_member;
  IF NOT (v_tenant = v_caller OR v_is_admin OR v_is_team_member) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.campanhas SET deleted_at = now(), status = 'pausada', updated_at = now() WHERE id = p_campaign_id;
  UPDATE public.leads_campanha SET state = 'desistente', exit_reason = 'campanha_deletada', closed_at = now()
  WHERE campaign_id = p_campaign_id AND state = 'ativo';
  UPDATE public.acoes_agendadas SET status = 'cancelado'
  WHERE action_type IN ('campaign_trigger','campaign_reproposta') AND status IN ('pending','pendente') AND campaign_id = p_campaign_id;
END;
$function$

