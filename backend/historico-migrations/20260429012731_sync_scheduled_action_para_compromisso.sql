
-- 1. Coluna de vínculo (idempotente)
ALTER TABLE public.compromissos
  ADD COLUMN IF NOT EXISTS scheduled_action_id uuid
    REFERENCES public.scheduled_actions(id) ON DELETE SET NULL;

-- 2. Index único parcial · garante 1:1 e evita duplicação no backfill repetido
CREATE UNIQUE INDEX IF NOT EXISTS compromissos_scheduled_action_id_uniq
  ON public.compromissos (scheduled_action_id)
  WHERE scheduled_action_id IS NOT NULL;

-- 3. Index normal pra busca reversa
CREATE INDEX IF NOT EXISTS compromissos_scheduled_action_id_idx
  ON public.compromissos (scheduled_action_id);

-- 4. Função de sync · SECURITY DEFINER pra contornar RLS quando trigger semântico (service_role) cria
CREATE OR REPLACE FUNCTION public.fn_sync_scheduled_action_para_compromisso()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_descricao text;
  v_acoes_sincronizadas text[] := ARRAY['agendamento_callback','agendamento_retorno'];
BEGIN
  -- Só age em tipos que representam compromisso visível na ficha
  IF NOT (NEW.action_type = ANY(v_acoes_sincronizadas)) THEN
    RETURN NEW;
  END IF;

  -- Pula se sem data
  IF NEW.scheduled_at IS NULL THEN
    RETURN NEW;
  END IF;

  -- Monta descrição a partir do payload (origem · data_original · motivo)
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
      NEW.conversation_id, NEW.lead_id, NEW.tenant_id,
      v_descricao, NEW.scheduled_at,
      'autonomo', 'pendente', NEW.id
    )
    ON CONFLICT (scheduled_action_id) WHERE scheduled_action_id IS NOT NULL
    DO NOTHING;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Status: executed → cumprido · cancelled → cancelado · pending → mantém
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

    -- Se data foi alterada, atualizar
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

-- 5. Trigger
DROP TRIGGER IF EXISTS trg_sync_scheduled_action_compromisso ON public.scheduled_actions;
CREATE TRIGGER trg_sync_scheduled_action_compromisso
  AFTER INSERT OR UPDATE ON public.scheduled_actions
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_sync_scheduled_action_para_compromisso();

-- 6. Backfill · todos scheduled_actions pendentes/executados desses tipos sem compromisso
INSERT INTO public.compromissos (
  conversation_id, lead_id, tenant_id, descricao, scheduled_at,
  origem, status, scheduled_action_id, created_at
)
SELECT
  sa.conversation_id, sa.lead_id, sa.tenant_id,
  coalesce(
    sa.payload->>'descricao',
    'Retorno agendado' ||
      coalesce(' · ' || (sa.payload->>'data_original'), '') ||
      coalesce(' · ' || (sa.payload->>'motivo'), '')
  ) AS descricao,
  sa.scheduled_at,
  'autonomo' AS origem,
  CASE
    WHEN sa.status IN ('executed','done') THEN 'cumprido'
    WHEN sa.status = 'cancelled' THEN 'cancelado'
    ELSE 'pendente'
  END AS status,
  sa.id AS scheduled_action_id,
  sa.created_at
FROM public.scheduled_actions sa
WHERE sa.action_type IN ('agendamento_callback','agendamento_retorno')
  AND sa.scheduled_at IS NOT NULL
  AND sa.lead_id IS NOT NULL
  AND sa.tenant_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.compromissos c WHERE c.scheduled_action_id = sa.id
  );

;
