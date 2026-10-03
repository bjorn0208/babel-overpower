CREATE TABLE IF NOT EXISTS public.chunks_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chunk_id uuid NOT NULL,
  chunk_tabela text NOT NULL,
  acao text NOT NULL CHECK (acao IN ('create','update','delete','toggle')),
  antes jsonb,
  depois jsonb,
  alterado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  alterado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chunks_audit_chunk_idx ON public.chunks_audit_log (chunk_id);
CREATE INDEX IF NOT EXISTS chunks_audit_alterado_em_idx ON public.chunks_audit_log (alterado_em DESC);

ALTER TABLE public.chunks_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_audit" ON public.chunks_audit_log;
CREATE POLICY "service_role_all_audit" ON public.chunks_audit_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);
;
