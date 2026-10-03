
ALTER TABLE public.behavior_chunks ADD COLUMN IF NOT EXISTS trigger_acao text NULL;
CREATE INDEX IF NOT EXISTS idx_behavior_chunks_trigger_acao ON public.behavior_chunks(trigger_acao) WHERE trigger_acao IS NOT NULL;
COMMENT ON COLUMN public.behavior_chunks.trigger_acao IS 'Quando setado, liga o chunk a uma acao de trigger_chunks.acao_disparada. Usado pra boost no reranker do search-behavior quando trigger dispara no turno.';

;
