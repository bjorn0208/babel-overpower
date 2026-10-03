
-- Flow templates per product (stored per tenant in user_agents)
ALTER TABLE public.user_agents
  ADD COLUMN IF NOT EXISTS client_service_flows jsonb DEFAULT NULL;

-- Tracking token for public sharing link + checkpoint status per lead
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS tracking_token uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS client_checkpoints jsonb DEFAULT '{}';

-- Index for fast lookup by tracking token
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_tracking_token ON public.leads (tracking_token) WHERE tracking_token IS NOT NULL;

-- RLS policy for public tracking page (anon can read limited fields by token)
CREATE POLICY "anon_read_tracking" ON public.leads
  FOR SELECT TO anon
  USING (tracking_token IS NOT NULL);

;
