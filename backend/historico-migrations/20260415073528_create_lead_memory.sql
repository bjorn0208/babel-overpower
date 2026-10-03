CREATE TABLE IF NOT EXISTS public.lead_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  fato text NOT NULL,
  categoria text NOT NULL DEFAULT 'outro'
    CHECK (categoria IN ('financeiro','familiar','profissional','emocional','preferencia','historico','outro')),
  relevancia text NOT NULL DEFAULT 'media' CHECK (relevancia IN ('alta','media','baixa')),
  fonte text NOT NULL DEFAULT 'auto' CHECK (fonte IN ('auto','manual')),
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  embedding halfvec(1536),
  embedding_status text NOT NULL DEFAULT 'pending'
    CHECK (embedding_status IN ('pending', 'processing', 'ready', 'failed')),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_memory_lead_id_idx ON public.lead_memory (lead_id);
CREATE INDEX IF NOT EXISTS lead_memory_tenant_id_idx ON public.lead_memory (tenant_id);
CREATE INDEX IF NOT EXISTS lead_memory_relevancia_idx ON public.lead_memory (relevancia);
CREATE INDEX IF NOT EXISTS lead_memory_embedding_hnsw ON public.lead_memory
  USING hnsw (embedding halfvec_cosine_ops) WITH (m = 16, ef_construction = 64)
  WHERE embedding IS NOT NULL;

ALTER TABLE public.lead_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_read_memory" ON public.lead_memory;
CREATE POLICY "tenant_read_memory" ON public.lead_memory
  FOR SELECT TO authenticated USING (tenant_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "tenant_write_memory" ON public.lead_memory;
CREATE POLICY "tenant_write_memory" ON public.lead_memory
  FOR ALL TO authenticated USING (tenant_id = (SELECT auth.uid()))
  WITH CHECK (tenant_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "service_role_all_memory" ON public.lead_memory;
CREATE POLICY "service_role_all_memory" ON public.lead_memory
  FOR ALL TO service_role USING (true) WITH CHECK (true);
;
