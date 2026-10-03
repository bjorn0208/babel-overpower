ALTER TABLE public.knowledge_chunks DROP CONSTRAINT IF EXISTS knowledge_chunks_tipo_check;
ALTER TABLE public.knowledge_chunks ALTER COLUMN tipo DROP DEFAULT;

UPDATE public.knowledge_chunks SET tipo =
  CASE tipo
    WHEN 'pitch' THEN 'apresentacao'
    WHEN 'oferta' THEN 'valor'
    WHEN 'resposta_factual' THEN 'resposta'
    WHEN 'instrucao_pagamento' THEN 'pagamento'
    WHEN 'processo' THEN 'processo'
    ELSE tipo
  END;

ALTER TABLE public.knowledge_chunks
  ADD CONSTRAINT knowledge_chunks_tipo_check
  CHECK (tipo IN ('apresentacao','valor','resposta','pagamento','processo'));

ALTER TABLE public.knowledge_chunks ALTER COLUMN tipo SET DEFAULT 'resposta';
;
