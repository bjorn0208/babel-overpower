CREATE TABLE IF NOT EXISTS public.human_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria text NOT NULL,
  subcategoria text,
  regra text NOT NULL,
  exemplos_bons text[] NOT NULL DEFAULT '{}',
  exemplos_ruins text[] NOT NULL DEFAULT '{}',
  contexto_uso text NOT NULL,
  quando_nao_usar text,
  tags_persona text[] NOT NULL DEFAULT '{}',
  escopo text NOT NULL DEFAULT 'universal' CHECK (escopo IN ('universal', 'nicho', 'tenant')),
  nicho_id uuid REFERENCES public.nichos(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  prioridade int NOT NULL DEFAULT 500,
  ativo boolean NOT NULL DEFAULT true,
  embedding halfvec(1536),
  embedding_status text NOT NULL DEFAULT 'pending'
    CHECK (embedding_status IN ('pending', 'processing', 'ready', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS human_chunks_categoria_idx ON public.human_chunks (categoria);
CREATE INDEX IF NOT EXISTS human_chunks_persona_gin_idx ON public.human_chunks USING gin (tags_persona);
CREATE INDEX IF NOT EXISTS human_chunks_ativo_idx ON public.human_chunks (ativo);
CREATE INDEX IF NOT EXISTS human_chunks_embedding_hnsw ON public.human_chunks
  USING hnsw (embedding halfvec_cosine_ops) WITH (m = 16, ef_construction = 64)
  WHERE embedding IS NOT NULL;

ALTER TABLE public.human_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_human" ON public.human_chunks;
CREATE POLICY "auth_read_human" ON public.human_chunks
  FOR SELECT TO authenticated USING (ativo = true);

DROP POLICY IF EXISTS "service_role_all_human" ON public.human_chunks;
CREATE POLICY "service_role_all_human" ON public.human_chunks
  FOR ALL TO service_role USING (true) WITH CHECK (true);
;
