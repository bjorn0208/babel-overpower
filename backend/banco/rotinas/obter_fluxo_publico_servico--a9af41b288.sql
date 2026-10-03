CREATE OR REPLACE FUNCTION public.obter_fluxo_publico_servico(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_tenant_id uuid; v_flows json;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM public.leads WHERE chave_rastreamento = p_token::uuid LIMIT 1;
  IF v_tenant_id IS NULL THEN RETURN NULL; END IF;
  SELECT ua.product_flows::json INTO v_flows FROM public.agentes_usuario ua WHERE ua.user_id = v_tenant_id LIMIT 1;
  RETURN v_flows;
END;
$function$

