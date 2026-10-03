CREATE TABLE IF NOT EXISTS public.trigger_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_trigger text NOT NULL,
  exemplo_frase text NOT NULL,
  acao_disparada text NOT NULL,
  acao_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  escopo text NOT NULL DEFAULT 'universal' CHECK (escopo IN ('universal', 'nicho', 'tenant')),
  nicho_id uuid REFERENCES public.nichos(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  ativo boolean NOT NULL DEFAULT true,
  embedding halfvec(1536),
  embedding_status text NOT NULL DEFAULT 'pending'
    CHECK (embedding_status IN ('pending', 'processing', 'ready', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trigger_chunks_nome_idx ON public.trigger_chunks (nome_trigger);
CREATE INDEX IF NOT EXISTS trigger_chunks_escopo_idx ON public.trigger_chunks (escopo);
CREATE INDEX IF NOT EXISTS trigger_chunks_ativo_idx ON public.trigger_chunks (ativo);
CREATE INDEX IF NOT EXISTS trigger_chunks_embedding_hnsw ON public.trigger_chunks
  USING hnsw (embedding halfvec_cosine_ops) WITH (m = 16, ef_construction = 64)
  WHERE embedding IS NOT NULL;

ALTER TABLE public.trigger_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_triggers" ON public.trigger_chunks;
CREATE POLICY "auth_read_triggers" ON public.trigger_chunks
  FOR SELECT TO authenticated USING (ativo = true);

DROP POLICY IF EXISTS "service_role_all_triggers" ON public.trigger_chunks;
CREATE POLICY "service_role_all_triggers" ON public.trigger_chunks
  FOR ALL TO service_role USING (true) WITH CHECK (true);
;
