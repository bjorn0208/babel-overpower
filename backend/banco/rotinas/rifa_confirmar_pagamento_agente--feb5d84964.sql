CREATE OR REPLACE FUNCTION public.rifa_confirmar_pagamento_agente(p_tenant_id uuid, p_pedido uuid, p_aprovar boolean, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select public.rifa_confirmar_pagamento_core(p_tenant_id, p_pedido, p_aprovar, p_motivo);
$function$

