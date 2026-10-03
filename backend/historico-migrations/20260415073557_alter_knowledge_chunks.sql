ALTER TABLE public.knowledge_chunks
  ADD COLUMN IF NOT EXISTS tipo text DEFAULT 'resposta_factual'
    CHECK (tipo IN ('pitch','oferta','resposta_factual','instrucao_pagamento','processo')),
  ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS knowledge_chunks_tipo_idx ON public.knowledge_chunks (tipo);
CREATE INDEX IF NOT EXISTS knowledge_chunks_ativo_idx ON public.knowledge_chunks (ativo);

UPDATE public.knowledge_chunks SET tipo =
  CASE category
    WHEN 'preco' THEN 'oferta'
    WHEN 'pagamento' THEN 'instrucao_pagamento'
    WHEN 'faq' THEN 'resposta_factual'
    WHEN 'objecao' THEN 'resposta_factual'
    WHEN 'conhecimento' THEN 'pitch'
    ELSE 'resposta_factual'
  END
WHERE tipo IS NULL OR tipo = 'resposta_factual';
;
