CREATE OR REPLACE FUNCTION public.conversas_recentes_tenant(p_tenant_id uuid, p_dias integer DEFAULT 30, p_limite integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_resultado jsonb;
BEGIN
  PERFORM set_config('search_path', 'public', true);
  PERFORM set_config('statement_timeout', '5s', true);

  SELECT coalesce(jsonb_agg(t ORDER BY t.created_at DESC), '[]'::jsonb)
  INTO v_resultado
  FROM (
    SELECT c.id, c.lead_id, c.phone, c.status, c.created_at,
           l.name AS lead_name, l.fase_pipeline, l.temperatura_lead, l.is_hot,
           (SELECT COUNT(*) FROM public.mensagens m WHERE m.conversation_id = c.id AND m.deleted_at IS NULL) AS turnos
    FROM public.conversas c
    LEFT JOIN public.leads l ON l.id = c.lead_id
    WHERE c.tenant_id = p_tenant_id
      AND c.created_at > now() - (p_dias || ' days')::interval
      AND c.phone NOT ILIKE 'chat-test-%'
    ORDER BY c.created_at DESC
    LIMIT p_limite
  ) t;

  RETURN v_resultado;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('erro', SQLERRM);
END
$function$

