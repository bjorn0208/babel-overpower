
-- =========================================================================
-- Migration: 20260421000100_scheduled_actions_campaign_column
-- Tarefa 1, Fase 1, Passo 3 (Módulo Campanha — denormalização pra matar seq scan)
-- =========================================================================
-- O que faz:
--   1. Adiciona `scheduled_actions.campaign_id uuid NULL`.
--   2. Cria função trigger `public.fn_scheduled_actions_set_campaign_id`
--      com `SET search_path = ''` + qualificação `public.scheduled_actions`
--      populando `NEW.campaign_id = (NEW.payload->>'campaign_id')::uuid`
--      quando `NEW.action_type LIKE 'campaign%'`.
--   3. Dispara BEFORE INSERT e BEFORE UPDATE OF payload (consistência).
--   4. Backfill single-shot: UPDATE scheduled_actions populando campaign_id
--      onde action_type LIKE 'campaign%' e campaign_id IS NULL.
--      Volume: ~61 rows (raio-X de 2026-04-19).
--   5. Índice parcial `idx_scheduled_actions_campaign_pending` pra cobrir
--      queries tipo "próximas ações pendentes da campanha X".
-- =========================================================================

-- 1. Coluna denormalizada
ALTER TABLE public.scheduled_actions
  ADD COLUMN IF NOT EXISTS campaign_id uuid NULL;

-- 2. Função trigger — search_path fechado + qualificação
CREATE OR REPLACE FUNCTION public.fn_scheduled_actions_set_campaign_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.action_type LIKE 'campaign%' THEN
    BEGIN
      NEW.campaign_id := (NEW.payload->>'campaign_id')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      -- payload inválido: mantém campaign_id NULL em vez de quebrar INSERT
      NEW.campaign_id := NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_scheduled_actions_set_campaign_id()
  IS 'Popula scheduled_actions.campaign_id a partir de payload->>campaign_id quando action_type LIKE campaign%.';

-- 3. Triggers BEFORE INSERT e BEFORE UPDATE (idempotente — DROP antes)
DROP TRIGGER IF EXISTS trg_scheduled_actions_set_campaign_id_insert
  ON public.scheduled_actions;
CREATE TRIGGER trg_scheduled_actions_set_campaign_id_insert
  BEFORE INSERT ON public.scheduled_actions
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_scheduled_actions_set_campaign_id();

DROP TRIGGER IF EXISTS trg_scheduled_actions_set_campaign_id_update
  ON public.scheduled_actions;
CREATE TRIGGER trg_scheduled_actions_set_campaign_id_update
  BEFORE UPDATE OF payload ON public.scheduled_actions
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_scheduled_actions_set_campaign_id();

-- 4. Backfill idempotente
UPDATE public.scheduled_actions
   SET campaign_id = (payload->>'campaign_id')::uuid
 WHERE action_type LIKE 'campaign%'
   AND campaign_id IS NULL
   AND payload ? 'campaign_id'
   AND (payload->>'campaign_id') ~ '^[0-9a-fA-F-]{36}$';

-- 5. Índice parcial
CREATE INDEX IF NOT EXISTS idx_scheduled_actions_campaign_pending
  ON public.scheduled_actions (campaign_id, status, scheduled_at)
  WHERE action_type LIKE 'campaign%' AND status = 'pending';

;
