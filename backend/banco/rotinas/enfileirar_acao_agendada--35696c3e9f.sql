CREATE OR REPLACE FUNCTION public.enfileirar_acao_agendada(p_conversation_id uuid, p_lead_id uuid, p_agente_id uuid, p_tenant_id uuid, p_action_type text, p_scheduled_at timestamp with time zone, p_carga jsonb DEFAULT '{}'::jsonb, p_node_name text DEFAULT NULL::text, p_template text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.acoes_agendadas (
    conversation_id,
    lead_id,
    agente_id,
    tenant_id,
    action_type,
    scheduled_at,
    status,
    carga,
    node_name,
    template,
    created_at
  )
  VALUES (
    p_conversation_id,
    p_lead_id,
    p_agente_id,
    p_tenant_id,
    p_action_type,
    p_scheduled_at,
    'pendente',
    COALESCE(p_carga, '{}'::jsonb),
    p_node_name,
    p_template,
    now()
  )
  ON CONFLICT (conversation_id, action_type, scheduled_at)
  WHERE status IN ('pendente','processando')
  DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id
    FROM public.acoes_agendadas
    WHERE conversation_id = p_conversation_id
      AND action_type     = p_action_type
      AND scheduled_at    = p_scheduled_at
      AND status IN ('pendente','processando')
    LIMIT 1;
  END IF;

  RETURN v_id;
END;
$function$

