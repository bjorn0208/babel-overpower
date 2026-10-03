-- DEC-017 · adiciona condicao_tipo='estrategia_retomada' em trigger_chunks
-- Esses chunks ensinam o LLM COMO retomar conversas (assunto + ângulo + tom)
-- com base em contexto (fase + objeção + engajamento). Não dispara sozinho ·
-- é puxado pelo planejador via Cohere rerank no momento de planejar retomada.

-- 1. Drop CHECKs antigos
ALTER TABLE public.trigger_chunks
  DROP CONSTRAINT IF EXISTS trigger_chunks_condicao_tipo_check;

ALTER TABLE public.trigger_chunks
  DROP CONSTRAINT IF EXISTS trigger_chunks_temporal_tempo_ck;

-- 2. CHECK ampliado · permite estrategia_retomada
ALTER TABLE public.trigger_chunks
  ADD CONSTRAINT trigger_chunks_condicao_tipo_check
  CHECK (condicao_tipo = ANY (ARRAY[
    'frase'::text,
    'silencio_pos_fase'::text,
    'nao_assinou_contrato'::text,
    'nao_enviou_comprovante'::text,
    'nao_respondeu_proposta'::text,
    'estrategia_retomada'::text
  ]));

-- 3. CHECK temporal · só temporais exigem tempo_aguardar_minutos
-- frase E estrategia_retomada não usam tempo (são consultivos)
ALTER TABLE public.trigger_chunks
  ADD CONSTRAINT trigger_chunks_temporal_tempo_ck
  CHECK (
    condicao_tipo IN ('frase', 'estrategia_retomada')
    OR tempo_aguardar_minutos IS NOT NULL
  );

COMMENT ON COLUMN public.trigger_chunks.condicao_tipo IS
  'Tipo de condição que dispara o trigger:
   ''frase'' = match semântico em fala do lead;
   ''silencio_pos_fase'' / ''nao_assinou_contrato'' / ''nao_enviou_comprovante'' /
   ''nao_respondeu_proposta'' = temporal (cron-sweep detecta);
   ''estrategia_retomada'' = chunk consultivo · LLM puxa via rerank pra decidir
   COMO retomar (ângulo, assunto, tom). DEC-017.';
;
