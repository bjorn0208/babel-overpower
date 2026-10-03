
-- UP: r01_5_get_lead_ficha_completa
-- Wave 0 / R01.5 — RPC de leitura agregada da ficha do lead (Motor Vivo)
-- SECURITY INVOKER: RLS das tabelas subjacentes protege isolamento por tenant.
-- Não requer search_path especial (sem operadores vetoriais).

CREATE OR REPLACE FUNCTION public.get_lead_ficha_completa(p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
STABLE
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'lead', to_jsonb(l.*),
    'conversations_count', (
      SELECT count(*)
      FROM public.conversations c
      WHERE c.lead_id = p_lead_id
    ),
    'belief_ativo', (
      SELECT to_jsonb(cb.*)
      FROM public.conversation_belief cb
      JOIN public.conversations c ON c.id = cb.conversation_id
      WHERE c.lead_id = p_lead_id
      ORDER BY cb.updated_at DESC
      LIMIT 1
    ),
    'memoria', (
      SELECT jsonb_agg(
        to_jsonb(lm.*) ORDER BY lm.criado_em DESC
      )
      FROM public.lead_memory lm
      WHERE lm.lead_id = p_lead_id
        AND lm.ativa = true
    ),
    'engajamento', (
      SELECT to_jsonb(le.*)
      FROM public.lead_engagement le
      WHERE le.lead_id = p_lead_id
    )
  ) INTO v_result
  FROM public.leads l
  WHERE l.id = p_lead_id;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_lead_ficha_completa(uuid) IS
  'Leitura agregada da ficha completa do lead (R01.5 — Motor Vivo). '
  'Retorna: lead, conversations_count, belief_ativo (último), memoria (ativas), engajamento. '
  'SECURITY INVOKER: RLS de cada tabela subjacente (leads, conversation_belief, '
  'lead_memory, lead_engagement) filtra por tenant automaticamente. '
  'Performance gate: deve retornar em < 50ms.';

GRANT EXECUTE ON FUNCTION public.get_lead_ficha_completa(uuid)
  TO authenticated, service_role;

;
