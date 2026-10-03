-- Busca por conteúdo no app Conversas: ILIKE '%termo%' em mensagens.content
-- precisa de índice trigram (232k linhas — seq scan a cada busca é inviável).
-- Parcial em deleted_at IS NULL: a busca só olha mensagens vivas.
-- lock_timeout: se algo segurar a tabela, falha rápido em vez de enfileirar
-- os INSERTs do webhook atrás do lock.
SET lock_timeout = '4s';
SET statement_timeout = '120s';

CREATE INDEX IF NOT EXISTS idx_mensagens_conteudo_trgm
  ON public.mensagens USING gin (content gin_trgm_ops)
  WHERE deleted_at IS NULL;
;
