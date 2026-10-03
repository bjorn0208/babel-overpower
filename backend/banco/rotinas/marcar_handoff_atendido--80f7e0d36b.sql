CREATE OR REPLACE FUNCTION public.marcar_handoff_atendido(p_lead_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_tenant uuid; v_caller uuid := (select auth.uid());
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.leads WHERE id = p_lead_id;
  IF v_tenant IS NULL THEN RETURN; END IF;
  IF v_tenant != v_caller AND NOT public.is_platform_admin()
     AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_caller AND parent_user_id = v_tenant) THEN
    RAISE EXCEPTION 'sem permissao pra atender handoff';
  END IF;
  UPDATE public.leads SET precisa_humano = false WHERE id = p_lead_id;
  UPDATE public.conversas SET visto_em = now(), status = 'humano', agent_enabled = false WHERE lead_id = p_lead_id;
END;
$function$

