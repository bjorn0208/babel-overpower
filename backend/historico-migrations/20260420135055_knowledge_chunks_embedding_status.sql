-- Migration: knowledge_chunks_embedding_status
-- Adiciona coluna embedding_status em knowledge_chunks
-- Necessário para rastreamento de estado do pipeline de embedding

-- Adicionar coluna com DEFAULT 'ready' para não invalidar chunks já embedados
ALTER TABLE public.knowledge_chunks
  ADD COLUMN IF NOT EXISTS embedding_status text NOT NULL DEFAULT 'ready'
    CHECK (embedding_status IN ('pending', 'ready', 'error'));

-- Marcar chunks sem embedding como 'pending' para re-processamento
UPDATE public.knowledge_chunks
  SET embedding_status = 'pending'
  WHERE embedding IS NULL;
;
