CREATE OR REPLACE FUNCTION public.amostragem_estratificada(p_max_conversas integer DEFAULT 50, p_dias integer DEFAULT 7, p_tenant_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_resultado jsonb;
BEGIN
  PERFORM set_config('search_path', 'public', true);
  PERFORM set_config('statement_timeout', '8s', true);

  SELECT coalesce(jsonb_agg(t ORDER BY t.peso DESC), '[]'::jsonb)
  INTO v_resultado
  FROM (
    SELECT c.id AS conversation_id,
           c.tenant_id,
           c.lead_id,
           c.status,
           c.created_at,
           (SELECT COUNT(*) FROM public.mensagens m WHERE m.conversation_id = c.id AND m.deleted_at IS NULL) AS turnos,
           CASE
             WHEN c.created_at > now() - interval '1 day' THEN 1.0
             WHEN c.created_at > now() - interval '3 days' THEN 0.7
             ELSE 0.4
           END AS peso
    FROM public.conversas c
    WHERE c.created_at > now() - (p_dias || ' days')::interval
      AND (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id)
      AND c.phone NOT ILIKE 'chat-test-%'
    ORDER BY peso DESC, RANDOM()
    LIMIT p_max_conversas
  ) t;

  RETURN v_resultado;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('erro', SQLERRM);
END $function$

