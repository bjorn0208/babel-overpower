CREATE OR REPLACE FUNCTION public.get_conversas_usadas(p_tenant_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT COUNT(*)::int FROM public.tickets_conversa ct
  WHERE ct.tenant_id = p_tenant_id
    AND ct.created_at >= (SELECT data_inicio FROM public.assinaturas_usuario
      WHERE user_id = p_tenant_id AND status IN ('active','ativa') LIMIT 1);
$function$

