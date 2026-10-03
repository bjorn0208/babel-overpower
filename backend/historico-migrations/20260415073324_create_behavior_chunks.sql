CREATE TABLE IF NOT EXISTS public.behavior_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escopo text NOT NULL CHECK (escopo IN ('universal', 'nicho', 'tenant', 'produto')),
  nicho_id uuid REFERENCES public.nichos(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  produto_id uuid REFERENCES public.produtos(id) ON DELETE CASCADE,
  rotulo_curto text NOT NULL,
  situacao_descricao text NOT NULL,
  instrucao text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  fase_aplicavel text NOT NULL DEFAULT 'qualquer'
    CHECK (fase_aplicavel IN ('saudacao', 'qualificacao', 'apresentacao', 'negociacao', 'fechado', 'qualquer')),
  origem text NOT NULL CHECK (origem IN ('plataforma', 'tenant_config', 'tenant')),
  prioridade int NOT NULL DEFAULT 500,
  ativo boolean NOT NULL DEFAULT true,
  vezes_usado int NOT NULL DEFAULT 0,
  versao int NOT NULL DEFAULT 1,
  embedding halfvec(1536),
  embedding_status text NOT NULL DEFAULT 'pending'
    CHECK (embedding_status IN ('pending', 'processing', 'ready', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT escopo_consistente CHECK (
    (escopo = 'universal' AND nicho_id IS NULL AND tenant_id IS NULL AND produto_id IS NULL)
    OR (escopo = 'nicho' AND nicho_id IS NOT NULL AND tenant_id IS NULL AND produto_id IS NULL)
    OR (escopo = 'tenant' AND tenant_id IS NOT NULL AND produto_id IS NULL)
    OR (escopo = 'produto' AND tenant_id IS NOT NULL AND produto_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS behavior_chunks_escopo_idx ON public.behavior_chunks (escopo);
CREATE INDEX IF NOT EXISTS behavior_chunks_tenant_id_idx ON public.behavior_chunks (tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS behavior_chunks_nicho_id_idx ON public.behavior_chunks (nicho_id) WHERE nicho_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS behavior_chunks_produto_id_idx ON public.behavior_chunks (produto_id) WHERE produto_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS behavior_chunks_ativo_idx ON public.behavior_chunks (ativo);
CREATE INDEX IF NOT EXISTS behavior_chunks_fase_idx ON public.behavior_chunks (fase_aplicavel);
CREATE INDEX IF NOT EXISTS behavior_chunks_tags_gin_idx ON public.behavior_chunks USING gin (tags);
CREATE INDEX IF NOT EXISTS behavior_chunks_embedding_hnsw ON public.behavior_chunks
  USING hnsw (embedding halfvec_cosine_ops) WITH (m = 16, ef_construction = 64)
  WHERE embedding IS NOT NULL;
CREATE INDEX IF NOT EXISTS behavior_chunks_fts_idx ON public.behavior_chunks
  USING gin (to_tsvector('portuguese', situacao_descricao || ' ' || instrucao));

ALTER TABLE public.behavior_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_read_chunks" ON public.behavior_chunks;
CREATE POLICY "tenant_read_chunks" ON public.behavior_chunks
  FOR SELECT TO authenticated USING (
    ativo = true AND (
      escopo = 'universal'
      OR (escopo = 'nicho' AND nicho_id = (SELECT nicho_id FROM public.profiles WHERE id = (SELECT auth.uid())))
      OR (escopo = 'tenant' AND tenant_id = (SELECT auth.uid()))
      OR (escopo = 'produto' AND tenant_id = (SELECT auth.uid()))
    )
  );

DROP POLICY IF EXISTS "tenant_write_chunks" ON public.behavior_chunks;
CREATE POLICY "tenant_write_chunks" ON public.behavior_chunks
  FOR ALL TO authenticated USING (
    (escopo = 'tenant' AND tenant_id = (SELECT auth.uid()))
    OR (escopo = 'produto' AND tenant_id = (SELECT auth.uid()))
  ) WITH CHECK (
    (escopo = 'tenant' AND tenant_id = (SELECT auth.uid()))
    OR (escopo = 'produto' AND tenant_id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "service_role_all_chunks" ON public.behavior_chunks;
CREATE POLICY "service_role_all_chunks" ON public.behavior_chunks
  FOR ALL TO service_role USING (true) WITH CHECK (true);
;
