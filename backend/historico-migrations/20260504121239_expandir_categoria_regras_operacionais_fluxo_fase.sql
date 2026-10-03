-- Onda 4 redesign-fluxo-fase-rag-first · adiciona 'fluxo_fase_threshold' ao CHECK constraint
ALTER TABLE public.regras_operacionais_chunks
  DROP CONSTRAINT IF EXISTS regras_operacionais_chunks_categoria_check;

ALTER TABLE public.regras_operacionais_chunks
  ADD CONSTRAINT regras_operacionais_chunks_categoria_check
  CHECK (categoria = ANY (ARRAY[
    'rag_threshold'::text,
    'rerank'::text,
    'delay_bolha'::text,
    'limite_bolha'::text,
    'pausa'::text,
    'modelo_llm'::text,
    'embed'::text,
    'fluxo_fase_threshold'::text
  ]));
;
