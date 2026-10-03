CREATE TABLE IF NOT EXISTS public.behavior_chunks_tenant_overrides (
  chunk_id uuid NOT NULL REFERENCES public.behavior_chunks(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ativo boolean NOT NULL DEFAULT false,
  motivo text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chunk_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS bctoverrides_tenant_idx ON public.behavior_chunks_tenant_overrides (tenant_id);

ALTER TABLE public.behavior_chunks_tenant_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_own_override" ON public.behavior_chunks_tenant_overrides;
CREATE POLICY "tenant_own_override" ON public.behavior_chunks_tenant_overrides
  FOR ALL TO authenticated USING (tenant_id = (SELECT auth.uid()))
  WITH CHECK (tenant_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "service_role_all_override" ON public.behavior_chunks_tenant_overrides;
CREATE POLICY "service_role_all_override" ON public.behavior_chunks_tenant_overrides
  FOR ALL TO service_role USING (true) WITH CHECK (true);
;
