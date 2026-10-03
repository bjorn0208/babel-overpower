CREATE OR REPLACE FUNCTION public.rifa_prazo_pagamento(p_rifa uuid)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select public.rifa_sorteio_em(p_rifa) - interval '1 hour'
$function$

