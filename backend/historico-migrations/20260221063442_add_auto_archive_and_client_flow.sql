
ALTER TABLE public.user_agents
  ADD COLUMN IF NOT EXISTS auto_archive_days integer DEFAULT 30,
  ADD COLUMN IF NOT EXISTS client_flow_stages jsonb DEFAULT NULL;

;
