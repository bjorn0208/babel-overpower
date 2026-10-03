-- Adiciona colunas que cron-retomar-agente, manipulacao handler e outros assumem existir.
-- Sintoma: Postgres log com "column scheduled_actions.tenant_id does not exist" a cada minuto.
-- cron-retomar-agente retornava 500 toda execução · retomada após manipulação nunca disparava.

ALTER TABLE public.scheduled_actions ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE public.scheduled_actions ADD COLUMN IF NOT EXISTS executed_at timestamptz;
ALTER TABLE public.scheduled_actions ADD COLUMN IF NOT EXISTS error_message text;

-- Backfill tenant_id pra rows existentes via conversations.
UPDATE public.scheduled_actions sa
SET tenant_id = c.tenant_id
FROM public.conversations c
WHERE sa.conversation_id = c.id
  AND sa.tenant_id IS NULL;

-- Index pro filtro/RLS futuro
CREATE INDEX IF NOT EXISTS idx_scheduled_actions_tenant_id
  ON public.scheduled_actions (tenant_id) WHERE tenant_id IS NOT NULL;

-- FK pra integridade (não cascade — soft consistency)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'scheduled_actions_tenant_fk'
      AND conrelid = 'public.scheduled_actions'::regclass
  ) THEN
    ALTER TABLE public.scheduled_actions
      ADD CONSTRAINT scheduled_actions_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;
;
