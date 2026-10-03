CREATE OR REPLACE FUNCTION public.conversas_unread_humano(p_tenant_id uuid)
 RETURNS TABLE(conversation_id uuid, ultima_msg_em timestamp with time zone, qtd_msgs_novas integer, needs_human_help boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT
    c.id AS conversation_id,
    MAX(m.created_at) AS ultima_msg_em,
    count(*)::int AS qtd_msgs_novas,
    coalesce(bool_or(l.precisa_humano), false) AS needs_human_help
  FROM public.conversas c
  JOIN public.mensagens m ON m.conversation_id = c.id
  LEFT JOIN public.leads l ON l.id = c.lead_id
  WHERE c.tenant_id = p_tenant_id
    AND c.agent_enabled = false
    AND m.role = 'user'
    AND m.deleted_at IS NULL
    AND m.created_at > coalesce(c.visto_em, '1970-01-01'::timestamptz)
    AND (
      p_tenant_id = (select auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = (select auth.uid()) AND parent_user_id = p_tenant_id
      )
    )
  GROUP BY c.id;
$function$

