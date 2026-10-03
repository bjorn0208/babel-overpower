CREATE TABLE IF NOT EXISTS public.campaign_automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('lembrete','followup','callback')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active bool NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.campaign_automations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campaign_automations_all_own" ON public.campaign_automations
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.campaigns c WHERE c.id = campaign_automations.campaign_id AND c.tenant_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.campaigns c WHERE c.id = campaign_automations.campaign_id AND c.tenant_id = auth.uid()
  ));

CREATE INDEX idx_campaign_automations_campaign ON public.campaign_automations(campaign_id, is_active);
;
