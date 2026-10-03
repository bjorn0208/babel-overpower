CREATE OR REPLACE FUNCTION public.derive_tags_for_lead(p_lead_id uuid)
 RETURNS integer
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT public.derivar_tags_para_lead(p_lead_id);
$function$

