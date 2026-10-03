-- Drop temporário pra permitir UPDATE dos rows
ALTER TABLE public.trigger_chunks
  DROP CONSTRAINT IF EXISTS trigger_chunks_condicao_tipo_check;
ALTER TABLE public.trigger_chunks
  DROP CONSTRAINT IF EXISTS trigger_chunks_temporal_tempo_ck;
;
