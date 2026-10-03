
-- Troca RETURNS TABLE por RETURNS jsonb pra evitar limite de 1000 linhas do PostgREST
DROP FUNCTION IF EXISTS public.unread_por_conversa(uuid);

CREATE OR REPLACE FUNCTION public.unread_por_conversa(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_caller uuid := (select auth.uid());
  v_result jsonb;
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

  SELECT coalesce(jsonb_agg(jsonb_build_object('conv_id', sub.id, 'qtd', sub.cnt)), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT c.id, count(m.id)::int AS cnt
    FROM public.conversations c
    JOIN public.messages m ON m.conversation_id = c.id
    WHERE c.tenant_id = p_tenant_id
      AND c.agent_enabled = false
      AND m.role = 'user'
      AND m.deleted_at IS NULL
      AND m.created_at > coalesce(c.visto_em, '1970-01-01'::timestamptz)
    GROUP BY c.id
  ) sub;

  RETURN v_result;
END;
$$;

;
