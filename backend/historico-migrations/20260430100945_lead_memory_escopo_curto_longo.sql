-- Separação curto vs longo prazo na lead_memory (Curadoria v2 · F3)
-- Curto: dura dentro do módulo · destilada pra longo via cron diário
-- Longo: fato consolidado, persiste sempre, cruza módulos

-- 1) Coluna escopo (default 'longo' pra retrocompatibilidade)
ALTER TABLE public.lead_memory
  ADD COLUMN IF NOT EXISTS escopo text NOT NULL DEFAULT 'longo'
    CHECK (escopo IN ('curto','longo'));

-- 2) Coluna modulo (só faz sentido pra escopo='curto' — qual módulo gerou)
ALTER TABLE public.lead_memory
  ADD COLUMN IF NOT EXISTS modulo text
    CHECK (modulo IS NULL OR modulo IN ('atendimento','base','campanha','clientes','agente'));

-- 3) Coluna destilado_em (timestamp da última destilação que promoveu curto→longo)
ALTER TABLE public.lead_memory
  ADD COLUMN IF NOT EXISTS destilado_em timestamptz;

-- 4) Coluna origem_curto_id (rastreio: longo gerado a partir de qual curto)
ALTER TABLE public.lead_memory
  ADD COLUMN IF NOT EXISTS origem_curto_ids uuid[];

-- 5) Index pra cron destilador (lê curto ativo nas últimas 24h por lead)
CREATE INDEX IF NOT EXISTS lead_memory_curto_pendente_idx
  ON public.lead_memory (lead_id, criado_em)
  WHERE escopo = 'curto' AND ativa = true AND destilado_em IS NULL;

-- 6) Index pra leitura de longo por lead (RAG)
CREATE INDEX IF NOT EXISTS lead_memory_longo_lead_idx
  ON public.lead_memory (lead_id)
  WHERE escopo = 'longo' AND ativa = true;

COMMENT ON COLUMN public.lead_memory.escopo IS 'curto = volátil por módulo, destilada pra longo via cron. longo = fato consolidado permanente, cruza módulos. Backfill: todas as rows pré-existentes ficam como longo.';
COMMENT ON COLUMN public.lead_memory.modulo IS 'Quando escopo=curto, qual módulo gerou. NULL pra longo.';

;
