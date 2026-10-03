-- DEC-017 · Espelha scheduled_action de planejamento e retomada em compromissos.
-- Distingue 2 estados:
--   'planejar_retomada'  → compromisso "Avaliando retomada · ângulo X" (intermediário · LLM ainda vai decidir)
--   'retomada_planejada' → compromisso "Retomada · {assunto}" com horário cravado pelo LLM
-- Quando 'planejar_retomada' executa e cria 'retomada_planejada', o intermediário deve ser
-- marcado como cumprido (linkado via parent_action_id no payload).

CREATE OR REPLACE FUNCTION public.fn_sync_scheduled_action_para_compromisso()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_descricao text;
  v_tenant_id uuid;
  v_eh_compromisso boolean;
  v_origem text;
  v_assunto text;
  v_angulo text;
BEGIN
  v_origem := NEW.payload->>'origem';

  -- Tipos de compromisso que sempre espelham
  v_eh_compromisso := NEW.action_type IN (
    'agendamento_callback',
    'agendamento_retorno',
    'lembrete_retorno',
    'iniciar_atendimento',
    'planejar_retomada',
    'retomada_planejada'
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

  -- Campos do payload pra retomada
  v_assunto := NEW.payload->>'assunto';
  v_angulo  := NEW.payload->>'angulo';

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
    WHEN 'planejar_retomada' THEN
      'Avaliando retomada' || coalesce(' · ' || (NEW.payload->>'condicao_tipo'), '')
    WHEN 'retomada_planejada' THEN
      'Retomada planejada' || coalesce(' · ' || v_assunto, '') || coalesce(' (' || v_angulo || ')', '')
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
;
