-- 2026-06-13: o cron de retomada deve PULAR conversas com compromisso do lead.
-- 'agendar_compromisso' (callback "me chama segunda") faltava na lista → cron atropelava
-- conversas que pediram pra falar depois. Inclui também 'cobranca_*' por origem trigger temporal.
CREATE OR REPLACE FUNCTION public.existe_compromisso_ativo(p_conversation_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.acoes_agendadas sa
    WHERE sa.conversation_id = p_conversation_id AND sa.status IN ('pending','pendente')
      AND (sa.action_type IN ('agendamento_callback','agendamento_retorno','lembrete_retorno','iniciar_atendimento','retomada_planejada','agendar_compromisso')
           OR (sa.action_type IN ('cobranca_pagamento','cobranca_assinatura') AND sa.carga->>'origem' IN ('trigger_promessa_data','trigger_promessa_assinatura')))
      AND sa.scheduled_at > now()
  );
$function$;
;
