CREATE OR REPLACE FUNCTION public.dados_trabalho_painel(p_tenant_id uuid, p_period_start timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(conversation_id uuid, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  RETURN QUERY
  SELECT m.conversation_id, m.created_at
  FROM public.mensagens m
  JOIN public.conversas c ON c.id = m.conversation_id
  WHERE c.tenant_id = p_tenant_id
    AND m.role = 'user'
    AND (p_period_start IS NULL OR m.created_at >= p_period_start)
  ORDER BY m.conversation_id, m.created_at;
END;
$function$

