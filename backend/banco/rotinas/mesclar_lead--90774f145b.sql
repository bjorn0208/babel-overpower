CREATE OR REPLACE FUNCTION public.mesclar_lead(p_lead_duplicado_id uuid, p_lead_canonico_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_a uuid; v_b uuid;
BEGIN
  SELECT tenant_id INTO v_a FROM public.leads WHERE id = p_lead_duplicado_id;
  SELECT tenant_id INTO v_b FROM public.leads WHERE id = p_lead_canonico_id;
  IF v_a IS NULL OR v_b IS NULL OR v_a <> v_b THEN
    RAISE EXCEPTION 'leads de tenants diferentes ou inexistentes';
  END IF;
  UPDATE public.leads SET mesclado_em = p_lead_canonico_id, deleted_at = now()
  WHERE id = p_lead_duplicado_id AND mesclado_em IS NULL;
  RETURN FOUND;
END;
$function$

