-- Ampliar fn_sync_scheduled_action_para_compromisso pra espelhar TODOS os tipos
-- de compromisso (callback, retorno, lembrete_retorno, iniciar_atendimento) +
-- cobranças COM data prometida pelo lead (origem trigger_promessa_data/_assinatura).
--
-- Cobranças com motivo automático (ex: contrato_gerado_cobranca_48h) NÃO espelham
-- pra ficha — são automações fixas pós-contrato, não compromisso explícito.

CREATE OR REPLACE FUNCTION public.fn_sync_scheduled_action_para_compromisso()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_descricao text;
  v_tenant_id uuid;
  v_eh_compromisso boolean;
  v_origem text;
BEGIN
  v_origem := NEW.payload->>'origem';

  -- Tipos de compromisso que sempre espelham
  v_eh_compromisso := NEW.action_type IN (
    'agendamento_callback',
    'agendamento_retorno',
    'lembrete_retorno',
    'iniciar_atendimento'
  );

  -- Cobranças só espelham quando origem indica promessa explícita do lead
  IF NOT v_eh_compromisso AND NEW.action_type IN ('cobranca_pagamento','cobranca_assinatura') THEN
    v_eh_compromisso := v_origem IN ('trigger_promessa_data','trigger_promessa_assinatura');
  END IF;

  IF NOT v_eh_compromisso THEN
    RETURN NEW;
  END IF;

  IF NEW.scheduled_at IS NULL THEN
    RETURN NEW;
  END IF;

  -- Resolve tenant_id (fallback via conversations)
  v_tenant_id := NEW.tenant_id;
  IF v_tenant_id IS NULL AND NEW.conversation_id IS NOT NULL THEN
    SELECT c.tenant_id INTO v_tenant_id
    FROM public.conversations c
    WHERE c.id = NEW.conversation_id;
  END IF;

  IF v_tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Descrição varia por tipo
  v_descricao := CASE NEW.action_type
    WHEN 'agendamento_callback' THEN
      'Retorno agendado' || coalesce(' · ' || (NEW.payload->>'data_original'), '')
    WHEN 'agendamento_retorno' THEN
      'Retorno agendado' || coalesce(' · ' || (NEW.payload->>'data_original'), '') || coalesce(' · ' || (NEW.payload->>'motivo'), '')
    WHEN 'lembrete_retorno' THEN
      'Lembrete antes do callback'
    WHEN 'iniciar_atendimento' THEN
      'Iniciar atendimento'
    WHEN 'cobranca_pagamento' THEN
      'Pagamento prometido pelo lead' || coalesce(' · ' || (NEW.payload->>'tom'), '')
    WHEN 'cobranca_assinatura' THEN
      'Assinatura prometida pelo lead' || coalesce(' · ' || (NEW.payload->>'tom'), '')
    ELSE 'Compromisso'
  END;

  -- Override: se payload trouxer descrição explícita, usa ela
  IF NEW.payload->>'descricao' IS NOT NULL THEN
    v_descricao := NEW.payload->>'descricao';
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.compromissos (
      conversation_id, lead_id, tenant_id, descricao, scheduled_at,
      origem, status, scheduled_action_id
    ) VALUES (
      NEW.conversation_id, NEW.lead_id, v_tenant_id,
      v_descricao, NEW.scheduled_at,
      'autonomo', 'pendente', NEW.id
    )
    ON CONFLICT (scheduled_action_id) WHERE scheduled_action_id IS NOT NULL
    DO NOTHING;

  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NEW.status IN ('executed','done') THEN
        UPDATE public.compromissos
           SET status = 'cumprido',
               cumprido_em = coalesce(NEW.executed_at, now())
         WHERE scheduled_action_id = NEW.id
           AND status = 'pendente';
      ELSIF NEW.status = 'cancelled' THEN
        UPDATE public.compromissos
           SET status = 'cancelado'
         WHERE scheduled_action_id = NEW.id
           AND status = 'pendente';
      END IF;
    END IF;

    IF NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at THEN
      UPDATE public.compromissos
         SET scheduled_at = NEW.scheduled_at,
             descricao    = v_descricao
       WHERE scheduled_action_id = NEW.id
         AND status = 'pendente';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Backfill: criar compromissos pra scheduled_actions de promessa explícita que ainda
-- não viraram compromisso (cobranças com origem trigger_promessa_*, lembrete_retorno, iniciar_atendimento).
INSERT INTO public.compromissos (
  conversation_id, lead_id, tenant_id, descricao, scheduled_at, origem, status, scheduled_action_id
)
SELECT
  sa.conversation_id,
  sa.lead_id,
  coalesce(sa.tenant_id, c.tenant_id) AS tenant_id,
  CASE sa.action_type
    WHEN 'lembrete_retorno' THEN 'Lembrete antes do callback'
    WHEN 'iniciar_atendimento' THEN 'Iniciar atendimento'
    WHEN 'cobranca_pagamento' THEN 'Pagamento prometido pelo lead' || coalesce(' · ' || (sa.payload->>'tom'), '')
    WHEN 'cobranca_assinatura' THEN 'Assinatura prometida pelo lead' || coalesce(' · ' || (sa.payload->>'tom'), '')
    ELSE 'Compromisso'
  END,
  sa.scheduled_at,
  'autonomo',
  CASE sa.status
    WHEN 'pending' THEN 'pendente'
    WHEN 'executed' THEN 'cumprido'
    WHEN 'done' THEN 'cumprido'
    WHEN 'cancelled' THEN 'cancelado'
    ELSE 'pendente'
  END,
  sa.id
FROM public.scheduled_actions sa
LEFT JOIN public.conversations c ON c.id = sa.conversation_id
WHERE (
  sa.action_type IN ('lembrete_retorno','iniciar_atendimento')
  OR (
    sa.action_type IN ('cobranca_pagamento','cobranca_assinatura')
    AND sa.payload->>'origem' IN ('trigger_promessa_data','trigger_promessa_assinatura')
  )
)
AND coalesce(sa.tenant_id, c.tenant_id) IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM public.compromissos cm WHERE cm.scheduled_action_id = sa.id
)
ON CONFLICT (scheduled_action_id) WHERE scheduled_action_id IS NOT NULL
DO NOTHING;
;
