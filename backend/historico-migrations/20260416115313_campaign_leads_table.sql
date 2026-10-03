CREATE TABLE IF NOT EXISTS public.campaign_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  phase text NOT NULL DEFAULT 'aguardando',
  state text NOT NULL DEFAULT 'ativo' CHECK (state IN ('ativo','fechado','desistente')),
  attempt_count int NOT NULL DEFAULT 0,
  entered_at timestamptz NOT NULL DEFAULT now(),
  last_contact_at timestamptz NULL,
  closed_at timestamptz NULL,
  exit_reason text NULL CHECK (exit_reason IN ('silencio','frase_negativa','recusa','opt_out','manual','convertido')),
  config_snapshot jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.campaign_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campaign_leads_select_own" ON public.campaign_leads
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.campaigns c WHERE c.id = campaign_leads.campaign_id AND c.tenant_id = auth.uid()
  ));

CREATE POLICY "campaign_leads_mutate_own" ON public.campaign_leads
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.campaigns c WHERE c.id = campaign_leads.campaign_id AND c.tenant_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.campaigns c WHERE c.id = campaign_leads.campaign_id AND c.tenant_id = auth.uid()
  ));

CREATE UNIQUE INDEX idx_campaign_leads_one_active_per_lead
  ON public.campaign_leads(lead_id) WHERE state = 'ativo';

CREATE INDEX idx_campaign_leads_campaign_state_phase
  ON public.campaign_leads(campaign_id, state, phase);

CREATE INDEX idx_campaign_leads_last_contact
  ON public.campaign_leads(campaign_id, last_contact_at) WHERE state = 'ativo';
;
