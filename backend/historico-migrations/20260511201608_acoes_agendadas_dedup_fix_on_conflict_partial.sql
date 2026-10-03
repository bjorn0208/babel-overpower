-- Corrige a RPC enfileirar_acao_agendada: partial unique index requer
-- ON CONFLICT (cols) WHERE pred (nao ON CONSTRAINT). O Postgres usa o
-- partial index automaticamente quando o predicate bate.
CREATE OR REPLACE FUNCTION public.enfileirar_acao_agendada(
  p_conversation_id uuid,
  p_lead_id         uuid,
  p_agente_id       uuid,
  p_tenant_id       uuid,
  p_action_type     text,
  p_scheduled_at    timestamptz,
  p_carga           jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
$$;
;
