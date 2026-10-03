CREATE TABLE IF NOT EXISTS public.base_segmentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  nome text NOT NULL,
  descricao text,
  filtros jsonb NOT NULL DEFAULT '{}'::jsonb,
  contagem_leads integer,
  atualizado_contagem_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS base_segmentos_tenant_idx
  ON public.base_segmentos (tenant_id, criado_em DESC);

ALTER TABLE public.base_segmentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS base_segmentos_tenant_all ON public.base_segmentos;
CREATE POLICY base_segmentos_tenant_all
  ON public.base_segmentos
  FOR ALL TO authenticated
  USING (tenant_id = (select auth.uid()))
  WITH CHECK (tenant_id = (select auth.uid()));

COMMENT ON TABLE public.base_segmentos IS 'Segmentos salvos da Base (CRM) — filtros nomeados reutilizáveis por campanha (Modo D do wizard).';
;
