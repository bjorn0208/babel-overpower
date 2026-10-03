CREATE OR REPLACE FUNCTION public._lead_pertence_caller(p_lead_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_tenant uuid;
  v_admin boolean;
  v_team boolean;
BEGIN
  IF v_caller IS NULL THEN RETURN false; END IF;
  SELECT tenant_id INTO v_tenant FROM public.leads WHERE id = p_lead_id;
  IF v_tenant IS NULL THEN RETURN false; END IF;
  v_admin := public.is_platform_admin();
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = v_caller AND parent_user_id = v_tenant
  ) INTO v_team;
  RETURN (v_tenant = v_caller OR v_admin OR v_team);
END;
$function$

