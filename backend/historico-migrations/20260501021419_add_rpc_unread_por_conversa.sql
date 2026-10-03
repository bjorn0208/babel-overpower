
CREATE OR REPLACE FUNCTION public.unread_por_conversa(p_tenant_id uuid)
RETURNS TABLE(conv_id uuid, qtd int)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_caller uuid := (select auth.uid());
BEGIN
  IF p_tenant_id != v_caller
     AND NOT public.is_platform_admin()
     AND NOT EXISTS (
       SELECT 1 FROM public.profiles
       WHERE id = v_caller AND parent_user_id = p_tenant_id
     )
  THEN
    RAISE EXCEPTION 'sem permissao';
  END IF;

  RETURN QUERY
  SELECT c.id, count(m.id)::int
  FROM public.conversations c
  JOIN public.messages m ON m.conversation_id = c.id
  WHERE c.tenant_id = p_tenant_id
    AND c.agent_enabled = false
    AND m.role = 'user'
    AND m.deleted_at IS NULL
    AND m.created_at > coalesce(c.visto_em, '1970-01-01'::timestamptz)
  GROUP BY c.id;
END;
$$;

;
