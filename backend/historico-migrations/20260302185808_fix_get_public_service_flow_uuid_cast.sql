
CREATE OR REPLACE FUNCTION public.get_public_service_flow(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  v_tenant_id uuid;
  v_flows json;
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM public.leads
  WHERE tracking_token = p_token::uuid
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT ua.product_flows::json INTO v_flows
  FROM public.user_agents ua
  WHERE ua.user_id = v_tenant_id
  LIMIT 1;

  RETURN v_flows;
END;
$function$;

;
