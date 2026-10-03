ALTER TABLE public.agente_cargo
  ADD COLUMN IF NOT EXISTS overrides_diretrizes jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS overrides_tarefas    jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.agente_cargo.overrides_diretrizes IS
  'Overrides do tenant sobre diretrizes herdadas. Shape: { "<diretriz_id>": { "ativa": boolean } }';
COMMENT ON COLUMN public.agente_cargo.overrides_tarefas IS
  'Overrides do tenant sobre tarefas herdadas. Shape: { "<tarefa_id>": { "ativa": boolean } }';
;
