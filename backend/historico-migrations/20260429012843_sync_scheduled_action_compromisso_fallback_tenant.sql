
-- Atualiza função pra fazer fallback de tenant_id via conversations quando NEW.tenant_id é null.
-- Bug histórico · alguns scheduled_actions criados pelo trigger semântico não setaram tenant_id.
CREATE OR REPLACE FUNCTION public.fn_sync_scheduled_action_para_compromisso()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_descricao text;
  v_tenant_id uuid;
  v_acoes_sincronizadas text[] := ARRAY['agendamento_callback','agendamento_retorno'];
BEGIN
  IF NOT (NEW.action_type = ANY(v_acoes_sincronizadas)) THEN
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

  v_descricao := coalesce(
    NEW.payload->>'descricao',
    'Retorno agendado' ||
      coalesce(' · ' || (NEW.payload->>'data_original'), '') ||
      coalesce(' · ' || (NEW.payload->>'motivo'), '')
  );

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
$$;

;
