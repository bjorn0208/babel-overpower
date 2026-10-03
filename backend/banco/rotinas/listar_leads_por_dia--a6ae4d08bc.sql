CREATE OR REPLACE FUNCTION public.listar_leads_por_dia(p_tenant_id uuid, p_inicio timestamp with time zone, p_fim timestamp with time zone, p_limite integer DEFAULT 20)
 RETURNS TABLE(lead_id uuid, name text, phone text, temperatura_lead text, fase_pipeline text, updated_at timestamp with time zone, total_mensagens bigint, ultima_mensagem_em timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT l.id,
         l.name,
         l.phone,
         l.temperatura_lead,
         l.fase_pipeline,
         l.updated_at,
         COUNT(m.id) AS total_mensagens,
         MAX(m.created_at) AS ultima_mensagem_em
  FROM public.mensagens m
  JOIN public.conversas c ON c.id = m.conversation_id
  JOIN public.leads l ON l.id = c.lead_id
  WHERE c.tenant_id = p_tenant_id
    AND c.channel <> 'teste'
    AND m.created_at >= p_inicio
    AND m.created_at < p_fim
    AND m.deleted_at IS NULL
  GROUP BY l.id
  ORDER BY MAX(m.created_at) DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limite, 20), 1), 50)
$function$

