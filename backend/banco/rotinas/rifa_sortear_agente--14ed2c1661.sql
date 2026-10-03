CREATE OR REPLACE FUNCTION public.rifa_sortear_agente(p_tenant_id uuid, p_rifa uuid, p_numero_manual integer DEFAULT NULL::integer, p_numeros_manuais integer[] DEFAULT NULL::integer[])
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select public.rifa_sortear_core(p_tenant_id, p_rifa, p_numero_manual, p_numeros_manuais);
$function$

