-- Edge gerar-embedding usa 'failed' (não 'error') quando Cohere falha.
-- Padroniza constraint pra aceitar tanto 'failed' quanto 'error'.
ALTER TABLE public.admin_ia_chunks DROP CONSTRAINT IF EXISTS admin_ia_chunks_embedding_status_check;
ALTER TABLE public.admin_ia_chunks ADD CONSTRAINT admin_ia_chunks_embedding_status_check
  CHECK (embedding_status IN ('pending','ready','failed','error'));
;
