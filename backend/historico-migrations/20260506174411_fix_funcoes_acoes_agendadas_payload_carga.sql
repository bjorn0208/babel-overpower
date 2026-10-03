-- Big-Bang Rename PT-BR renomeou acoes_agendadas.payload -> carga
-- Duas trigger functions ficaram apontando pra coluna inexistente,
-- bloqueando todo INSERT/UPDATE em acoes_agendadas.

CREATE OR REPLACE FUNCTION public.fn_acoes_agendadas_definir_campanha_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF NEW.action_type LIKE 'campaign%' THEN
    BEGIN
      NEW.campaign_id := (NEW.carga->>'campaign_id')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      NEW.campaign_id := NULL;
    END;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_sincronizar_acao_agendada_para_compromisso()
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
  v_assunto text;
  v_angulo text;
BEGIN
  v_origem := NEW.carga->>'origem';
  v_eh_compromisso := NEW.action_type IN (
    'agendamento_callback','agendamento_retorno','lembrete_retorno',
    'iniciar_atendimento','planejar_retomada','retomada_planejada'
  );
  IF NOT v_eh_compromisso AND NEW.action_type IN ('cobranca_pagamento','cobranca_assinatura') THEN
    v_eh_compromisso := v_origem IN ('trigger_promessa_data','trigger_promessa_assinatura');
  END IF;
  IF NOT v_eh_compromisso THEN RETURN NEW; END IF;
  IF NEW.scheduled_at IS NULL THEN RETURN NEW; END IF;

  v_tenant_id := NEW.tenant_id;
  IF v_tenant_id IS NULL AND NEW.conversation_id IS NOT NULL THEN
    SELECT c.tenant_id INTO v_tenant_id FROM public.conversas c WHERE c.id = NEW.conversation_id;
  END IF;
  IF v_tenant_id IS NULL THEN RETURN NEW; END IF;

  v_assunto := NEW.carga->>'assunto';
  v_angulo := NEW.carga->>'angulo';

  v_descricao := CASE NEW.action_type
    WHEN 'agendamento_callback' THEN 'Retorno agendado' || coalesce(' · ' || (NEW.carga->>'data_original'), '')
    WHEN 'agendamento_retorno' THEN 'Retorno agendado' || coalesce(' · ' || (NEW.carga->>'data_original'), '') || coalesce(' · ' || (NEW.carga->>'motivo'), '')
    WHEN 'lembrete_retorno' THEN 'Lembrete antes do callback'
    WHEN 'iniciar_atendimento' THEN 'Iniciar atendimento'
    WHEN 'cobranca_pagamento' THEN 'Pagamento prometido pelo lead' || coalesce(' · ' || (NEW.carga->>'tom'), '')
    WHEN 'cobranca_assinatura' THEN 'Assinatura prometida pelo lead' || coalesce(' · ' || (NEW.carga->>'tom'), '')
    WHEN 'planejar_retomada' THEN 'Avaliando retomada' || coalesce(' · ' || (NEW.carga->>'condicao_tipo'), '')
    WHEN 'retomada_planejada' THEN 'Retomada planejada' || coalesce(' · ' || v_assunto, '') || coalesce(' (' || v_angulo || ')', '')
    ELSE 'Compromisso'
  END;

  IF NEW.carga->>'descricao' IS NOT NULL THEN
    v_descricao := NEW.carga->>'descricao';
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.compromissos (conversation_id, lead_id, tenant_id, descricao, scheduled_at, origem, status, scheduled_action_id)
    VALUES (NEW.conversation_id, NEW.lead_id, v_tenant_id, v_descricao, NEW.scheduled_at, 'autonomo', 'pendente', NEW.id)
    ON CONFLICT (scheduled_action_id) WHERE scheduled_action_id IS NOT NULL DO NOTHING;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NEW.status IN ('executed','done','executado') THEN
        UPDATE public.compromissos SET status = 'cumprido', cumprido_em = coalesce(NEW.executed_at, now())
        WHERE scheduled_action_id = NEW.id AND status = 'pendente';
      ELSIF NEW.status IN ('cancelled','cancelado') THEN
        UPDATE public.compromissos SET status = 'cancelado'
        WHERE scheduled_action_id = NEW.id AND status = 'pendente';
      END IF;
    END IF;
    IF NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at THEN
      UPDATE public.compromissos SET scheduled_at = NEW.scheduled_at, descricao = v_descricao
      WHERE scheduled_action_id = NEW.id AND status = 'pendente';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
;
