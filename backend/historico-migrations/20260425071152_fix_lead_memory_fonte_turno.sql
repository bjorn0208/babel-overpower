
ALTER TABLE public.lead_memory ADD COLUMN IF NOT EXISTS fonte_turno int NULL;

COMMENT ON COLUMN public.lead_memory.fonte_turno IS 'Número do turno (cicloFase) onde esse fato foi extraído pelo agente. NULL = origem manual ou cron (não-turno).';

;
