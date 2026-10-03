
-- Fix: Remove SECURITY DEFINER from token_usage_stats view
DROP VIEW IF EXISTS public.token_usage_stats;

CREATE VIEW public.token_usage_stats AS
SELECT 
  au.api_key_id,
  ak.provider,
  COALESCE(au.model, ak.model) as model,
  DATE(au.created_at) as usage_date,
  COUNT(*) as total_requests,
  SUM(au.total_tokens) as total_tokens,
  SUM(au.cost_total) as total_cost_usd
FROM api_usage au
JOIN api_keys ak ON au.api_key_id = ak.id
GROUP BY au.api_key_id, ak.provider, COALESCE(au.model, ak.model), DATE(au.created_at);

-- Ensure view uses SECURITY INVOKER (RLS applies to querying user)
ALTER VIEW public.token_usage_stats SET (security_invoker = on);

;
