CREATE TABLE IF NOT EXISTS public.tenant_opt_outs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  reason text NOT NULL DEFAULT 'opt_out_explicito',
  source_campaign_id uuid NULL REFERENCES public.campaigns(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, lead_id)
);

ALTER TABLE public.tenant_opt_outs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_opt_outs_all_own" ON public.tenant_opt_outs
  FOR ALL TO authenticated
  USING (tenant_id = auth.uid())
  WITH CHECK (tenant_id = auth.uid());

CREATE INDEX idx_tenant_opt_outs_tenant_lead ON public.tenant_opt_outs(tenant_id, lead_id);
;
