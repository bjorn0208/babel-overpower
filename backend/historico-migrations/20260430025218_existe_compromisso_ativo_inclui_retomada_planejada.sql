-- DEC-017 · retomada_planejada cria compromisso firme · evita o cron empilhar
-- novos planejamentos enquanto existe um já cravado. planejar_retomada NÃO entra
-- (é intent transitória · vira retomada_planejada após LLM decidir).
CREATE OR REPLACE FUNCTION public.existe_compromisso_ativo(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.scheduled_actions sa
    WHERE sa.conversation_id = p_conversation_id
      AND sa.status = 'pending'
      AND (
        sa.action_type IN (
          'agendamento_callback',
          'agendamento_retorno',
          'lembrete_retorno',
          'iniciar_atendimento',
          'retomada_planejada'
        )
        OR (
          sa.action_type IN ('cobranca_pagamento', 'cobranca_assinatura')
          AND sa.payload->>'origem' IN ('trigger_promessa_data', 'trigger_promessa_assinatura')
        )
      )
      AND sa.scheduled_at > now()
  );
$function$;
;
