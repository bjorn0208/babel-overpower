CREATE OR REPLACE FUNCTION public.arquivar_desistentes(p_campaign_lead_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_count  integer;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  WITH allowed AS (
    SELECT cl.id
      FROM public.leads_campanha cl
      JOIN public.campanhas c ON c.id = cl.campaign_id
     WHERE cl.id = ANY(p_campaign_lead_ids)
       AND (
             c.tenant_id = v_caller
          OR c.tenant_id IN (
               SELECT p.parent_user_id FROM public.profiles p
                WHERE p.id = v_caller AND p.parent_user_id IS NOT NULL
             )
          OR public.is_platform_admin()
       )
       AND cl.state = 'desistente'
       AND cl.archived_at IS NULL
  )
  UPDATE public.leads_campanha cl
     SET archived_at = now()
    FROM allowed a
   WHERE cl.id = a.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$

