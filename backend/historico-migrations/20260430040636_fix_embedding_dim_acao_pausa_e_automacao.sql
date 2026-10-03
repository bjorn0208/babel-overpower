-- Drop indexes que dependem da coluna embedding (recriaremos depois)
DROP INDEX IF EXISTS public.acao_pausa_embedding_idx;
DROP INDEX IF EXISTS public.automacao_chunks_embedding_idx;

-- Alinha dimensão com a edge function gerar-embedding (EMBED_DIM=1536, halfvec)
ALTER TABLE public.acao_pausa_chunks
  ALTER COLUMN embedding TYPE halfvec(1536) USING NULL;

ALTER TABLE public.automacao_chunks
  ALTER COLUMN embedding TYPE halfvec(1536) USING NULL;

-- Recria índices HNSW com halfvec_cosine_ops
CREATE INDEX acao_pausa_embedding_idx ON public.acao_pausa_chunks
  USING hnsw (embedding halfvec_cosine_ops) WHERE embedding IS NOT NULL;

CREATE INDEX automacao_chunks_embedding_idx ON public.automacao_chunks
  USING hnsw (embedding halfvec_cosine_ops) WHERE embedding IS NOT NULL;

-- Re-enfileira todos os chunks pendentes pra processar de novo com dim correta
UPDATE public.acao_pausa_chunks
SET gatilho_descricao = gatilho_descricao
WHERE embedding_status = 'pending';

UPDATE public.automacao_chunks
SET nome = nome
WHERE embedding_status = 'pending';
;
