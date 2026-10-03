CREATE TABLE IF NOT EXISTS public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  type text NOT NULL CHECK (type IN ('divulgacao','venda','pos_venda','cobranca','agendamento')),
  objective text NOT NULL,
  product_id uuid NULL REFERENCES public.produtos(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','finished')),
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  duration_mode text NOT NULL CHECK (duration_mode IN ('prazo','periodica','vitalicia')),
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NULL,
  recurrence jsonb NULL,
  throttle_per_day int NULL,
  throttle_per_hour int NULL,
  window_start time NOT NULL DEFAULT '09:00',
  window_end time NOT NULL DEFAULT '20:00',
  weekdays int[] NOT NULL DEFAULT '{1,2,3,4,5}'::int[],
  skip_holidays bool NOT NULL DEFAULT true,
  desistance_silence_days int NOT NULL DEFAULT 7,
  desistance_phrases text[] NOT NULL DEFAULT ARRAY['não quero','chega','para','pare','remova','não manda mais'],
  response_actions text[] NOT NULL DEFAULT '{}',
  attempt_thresholds jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campaigns_select_own" ON public.campaigns
  FOR SELECT TO authenticated
  USING (tenant_id = auth.uid());

CREATE POLICY "campaigns_insert_own" ON public.campaigns
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = auth.uid());

CREATE POLICY "campaigns_update_own" ON public.campaigns
  FOR UPDATE TO authenticated
  USING (tenant_id = auth.uid())
  WITH CHECK (tenant_id = auth.uid());

CREATE POLICY "campaigns_delete_own" ON public.campaigns
  FOR DELETE TO authenticated
  USING (tenant_id = auth.uid());

CREATE INDEX idx_campaigns_tenant_status ON public.campaigns(tenant_id, status);
CREATE INDEX idx_campaigns_tenant_type ON public.campaigns(tenant_id, type) WHERE status = 'active';
;
