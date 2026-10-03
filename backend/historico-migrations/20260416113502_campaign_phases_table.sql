CREATE TABLE IF NOT EXISTS public.campaign_phases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  slug text NOT NULL,
  order_index int NOT NULL,
  description text NOT NULL DEFAULT '',
  instruction text NOT NULL DEFAULT '',
  regra text NOT NULL DEFAULT '',
  is_final_positive bool NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, slug),
  UNIQUE (campaign_id, order_index)
);

ALTER TABLE public.campaign_phases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campaign_phases_select_own" ON public.campaign_phases
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.campaigns c WHERE c.id = campaign_phases.campaign_id AND c.tenant_id = auth.uid()
  ));

CREATE POLICY "campaign_phases_mutate_own" ON public.campaign_phases
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.campaigns c WHERE c.id = campaign_phases.campaign_id AND c.tenant_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.campaigns c WHERE c.id = campaign_phases.campaign_id AND c.tenant_id = auth.uid()
  ));

CREATE INDEX idx_campaign_phases_campaign_order ON public.campaign_phases(campaign_id, order_index);
;
