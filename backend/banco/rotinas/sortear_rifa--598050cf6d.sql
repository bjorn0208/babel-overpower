CREATE OR REPLACE FUNCTION public.sortear_rifa(p_rifa uuid, p_numero_manual integer DEFAULT NULL::integer, p_numeros_manuais integer[] DEFAULT NULL::integer[])
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select public.rifa_sortear_core((select auth.uid()), p_rifa, p_numero_manual, p_numeros_manuais);
$function$

