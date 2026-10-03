CREATE OR REPLACE FUNCTION public.converter_em_cliente(p_campaign_lead_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_lead   uuid;
  v_tenant uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  SELECT cl.lead_id, c.tenant_id
    INTO v_lead, v_tenant
    FROM public.leads_campanha cl
    JOIN public.campanhas c ON c.id = cl.campaign_id
   WHERE cl.id = p_campaign_lead_id;

  IF v_lead IS NULL THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  IF NOT (
       v_tenant = v_caller
    OR EXISTS (
         SELECT 1 FROM public.profiles p
          WHERE p.id = v_caller AND p.parent_user_id = v_tenant
       )
    OR public.is_platform_admin()
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Marca lead convertido
  UPDATE public.leads
     SET converted_at = COALESCE(converted_at, now()),
         updated_at   = now()
   WHERE id = v_lead;

  -- Fecha + arquiva campaign_lead
  UPDATE public.leads_campanha
     SET state        = 'fechado',
         exit_reason  = 'convertido',
         closed_at    = COALESCE(closed_at, now()),
         archived_at  = COALESCE(archived_at, now())
   WHERE id = p_campaign_lead_id;
END;
$function$

