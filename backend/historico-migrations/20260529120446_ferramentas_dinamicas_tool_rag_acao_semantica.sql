-- Cano de tools-RAG de ação semântica (técnicas 2/3/4 + tese 23 read/write).
-- Aditivo: nenhuma RLS/policy nova, nenhuma view. Tabela ferramentas_dinamicas já tem RLS.

ALTER TABLE public.ferramentas_dinamicas
  ADD COLUMN IF NOT EXISTS tipo_acesso text NOT NULL DEFAULT 'escrita',
  ADD COLUMN IF NOT EXISTS vetor_semantico halfvec(1536);

-- CHECK idempotente (ADD CONSTRAINT IF NOT EXISTS não existe no Postgres)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ferramentas_dinamicas_tipo_acesso_check'
  ) THEN
    ALTER TABLE public.ferramentas_dinamicas
      ADD CONSTRAINT ferramentas_dinamicas_tipo_acesso_check
      CHECK (tipo_acesso IN ('leitura','escrita'));
  END IF;
END $$;

-- Índice HNSW pro seletor semântico de ferramentas (técnica 2). Cosseno, igual aos blocos.
CREATE INDEX IF NOT EXISTS ferramentas_dinamicas_vetor_hnsw
  ON public.ferramentas_dinamicas
  USING hnsw (vetor_semantico halfvec_cosine_ops);

COMMENT ON COLUMN public.ferramentas_dinamicas.tipo_acesso IS
  'leitura = ferramenta só consulta (RAG/query, não muda dado); escrita = ferramenta altera dado. Tese 23 (read/write tools): leitura sempre devolve resultado antes do LLM compor a resposta.';
COMMENT ON COLUMN public.ferramentas_dinamicas.vetor_semantico IS
  'Embedding (Cohere embed-v4, 1536d, halfvec) da descrição da ferramenta — seletor semântico (técnica 2: descrição embedada). NULL = ferramenta não entra no seletor por similaridade.';
COMMENT ON COLUMN public.ferramentas_dinamicas.endpoint_url IS
  'internal://<handler> (handler hardcoded), https://<host> (webhook externo sandbox), ou rag://<busca_hibrida_X> (ferramenta de ação semântica: embeda args.busca -> RPC busca_hibrida -> rerank).';
;
