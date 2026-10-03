CREATE OR REPLACE FUNCTION public.confirmar_pagamento_pedido_rifa(p_pedido uuid, p_aprovar boolean, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select public.rifa_confirmar_pagamento_core((select auth.uid()), p_pedido, p_aprovar, p_motivo);
$function$

