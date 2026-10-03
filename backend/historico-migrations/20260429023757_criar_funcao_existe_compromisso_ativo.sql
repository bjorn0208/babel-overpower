-- Função utilitária pra checar se a conversation tem compromisso pending.
-- Compromisso = scheduled_action que veio de promessa explícita do lead
-- (callback, retorno, cobrança com data prometida) ou agendamento humano.
-- Cron-sweep e process-followups consultam ANTES de criar/processar
-- automação genérica — DEC-014 prioridade compromisso.

CREATE OR REPLACE FUNCTION public.existe_compromisso_ativo(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.scheduled_actions sa
    WHERE sa.conversation_id = p_conversation_id
      AND sa.status = 'pending'
      AND (
        sa.action_type IN ('agendamento_callback', 'agendamento_retorno', 'lembrete_retorno', 'iniciar_atendimento')
        OR (
          sa.action_type IN ('cobranca_pagamento', 'cobranca_assinatura')
          AND sa.payload->>'origem' IN ('trigger_promessa_data', 'trigger_promessa_assinatura')
        )
      )
      AND sa.scheduled_at > now()
  );
$$;

COMMENT ON FUNCTION public.existe_compromisso_ativo(uuid) IS
'Retorna TRUE se conversation tem scheduled_action pending de compromisso explícito (callback/retorno/cobrança-com-data-prometida) com data futura. Usada por cron-sweep-triggers-temporais e process-followups pra evitar atropelar compromisso já agendado pelo lead.';
;
