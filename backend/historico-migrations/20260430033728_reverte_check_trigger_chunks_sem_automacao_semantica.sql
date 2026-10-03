-- Reverte trigger_chunks pra somente os condicao_tipo originais (sem 'automacao_semantica')
ALTER TABLE public.trigger_chunks
  DROP CONSTRAINT IF EXISTS trigger_chunks_condicao_tipo_check;
ALTER TABLE public.trigger_chunks
  DROP CONSTRAINT IF EXISTS trigger_chunks_temporal_tempo_ck;

ALTER TABLE public.trigger_chunks
  ADD CONSTRAINT trigger_chunks_condicao_tipo_check
  CHECK (condicao_tipo = ANY (ARRAY[
    'frase'::text,
    'silencio_pos_fase'::text,
    'nao_assinou_contrato'::text,
    'nao_enviou_comprovante'::text,
    'nao_respondeu_proposta'::text
  ]));

ALTER TABLE public.trigger_chunks
  ADD CONSTRAINT trigger_chunks_temporal_tempo_ck
  CHECK (
    condicao_tipo = 'frase'
    OR tempo_aguardar_minutos IS NOT NULL
  );

COMMENT ON COLUMN public.trigger_chunks.condicao_tipo IS
  'Tipo de condição que dispara o trigger (ações por FALA do lead):
   ''frase'' = match semântico em fala do lead;
   demais = temporais detectados pelo cron-sweep. RAGs consultivos pra
   AUTOMAÇÕES (lead em silêncio) ficam em automacao_chunks (DEC-017).';
;
