CREATE TABLE IF NOT EXISTS public.perguntas_sem_resposta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  pergunta text NOT NULL,
  contexto text,
  embedding halfvec(1536),
  ocorrencias int NOT NULL DEFAULT 1,
  resolvido boolean NOT NULL DEFAULT false,
  resolvido_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  ultima_ocorrencia timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS perguntas_sem_resp_tenant_idx ON public.perguntas_sem_resposta (tenant_id);
CREATE INDEX IF NOT EXISTS perguntas_sem_resp_resolvido_idx ON public.perguntas_sem_resposta (resolvido);
CREATE INDEX IF NOT EXISTS perguntas_sem_resp_embedding_hnsw ON public.perguntas_sem_resposta
  USING hnsw (embedding halfvec_cosine_ops) WITH (m = 16, ef_construction = 64)
  WHERE embedding IS NOT NULL;

ALTER TABLE public.perguntas_sem_resposta ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_read_psr" ON public.perguntas_sem_resposta;
CREATE POLICY "tenant_read_psr" ON public.perguntas_sem_resposta
  FOR SELECT TO authenticated USING (tenant_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "service_role_all_psr" ON public.perguntas_sem_resposta;
CREATE POLICY "service_role_all_psr" ON public.perguntas_sem_resposta
  FOR ALL TO service_role USING (true) WITH CHECK (true);
;
