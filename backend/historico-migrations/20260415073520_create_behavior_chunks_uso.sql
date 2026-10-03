CREATE TABLE IF NOT EXISTS public.behavior_chunks_uso (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  turno int NOT NULL,
  chunk_id uuid NOT NULL,
  chunk_tabela text NOT NULL CHECK (chunk_tabela IN ('behavior_chunks','knowledge_chunks','human_chunks','variation_chunks')),
  topicos_abordados text[] DEFAULT '{}',
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS behavior_chunks_uso_conv_turno_idx ON public.behavior_chunks_uso (conversation_id, turno DESC);
CREATE INDEX IF NOT EXISTS behavior_chunks_uso_chunk_idx ON public.behavior_chunks_uso (chunk_id);
CREATE INDEX IF NOT EXISTS behavior_chunks_uso_topicos_gin_idx ON public.behavior_chunks_uso USING gin (topicos_abordados);

ALTER TABLE public.behavior_chunks_uso ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_uso" ON public.behavior_chunks_uso;
CREATE POLICY "service_role_all_uso" ON public.behavior_chunks_uso
  FOR ALL TO service_role USING (true) WITH CHECK (true);
;
