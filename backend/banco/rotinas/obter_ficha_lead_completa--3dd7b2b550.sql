CREATE OR REPLACE FUNCTION public.obter_ficha_lead_completa(p_lead_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'lead', to_jsonb(l.*),
    'conversations_count', (
      SELECT count(*)
      FROM public.conversas c
      WHERE c.lead_id = p_lead_id
    ),
    'belief_ativo', (
      SELECT to_jsonb(cb.*)
      FROM public.crenca_conversa cb
      JOIN public.conversas c ON c.id = cb.conversation_id
      WHERE c.lead_id = p_lead_id
      ORDER BY cb.updated_at DESC
      LIMIT 1
    ),
    'memoria', (
      SELECT jsonb_agg(
        to_jsonb(lm.*) ORDER BY lm.criado_em DESC
      )
      FROM public.memoria_lead lm
      WHERE lm.lead_id = p_lead_id
        AND lm.ativa = true
    ),
    'engajamento', (
      SELECT to_jsonb(le.*)
      FROM public.engajamento_lead le
      WHERE le.lead_id = p_lead_id
    )
  ) INTO v_result
  FROM public.leads l
  WHERE l.id = p_lead_id;

  RETURN v_result;
END;
$function$

