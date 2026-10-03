ALTER TABLE public.trigger_chunks
  ADD CONSTRAINT trigger_chunks_condicao_tipo_check
  CHECK (condicao_tipo = ANY (ARRAY[
    'frase'::text,
    'silencio_pos_fase'::text,
    'nao_assinou_contrato'::text,
    'nao_enviou_comprovante'::text,
    'nao_respondeu_proposta'::text,
    'automacao_semantica'::text
  ]));

ALTER TABLE public.trigger_chunks
  ADD CONSTRAINT trigger_chunks_temporal_tempo_ck
  CHECK (
    condicao_tipo IN ('frase', 'automacao_semantica')
    OR tempo_aguardar_minutos IS NOT NULL
  );

COMMENT ON COLUMN public.trigger_chunks.condicao_tipo IS
  'Tipo de condição:
   ''frase'' = match semântico em fala do lead;
   ''silencio_pos_fase'' / ''nao_assinou_contrato'' / ''nao_enviou_comprovante'' /
   ''nao_respondeu_proposta'' = temporal (cron-sweep detecta);
   ''automacao_semantica'' = chunk consultivo · LLM puxa via rerank pra
   se orientar no momento de planejar uma automação (DEC-017).';
;
