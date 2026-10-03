
-- 1. Add product_flows JSONB column to user_agents
ALTER TABLE public.user_agents ADD COLUMN IF NOT EXISTS product_flows jsonb DEFAULT '[]'::jsonb;

-- 2. Seed Silvia's "Limpa Nome" with the current CLIENT_STAGES as default flow
UPDATE public.user_agents
SET product_flows = '[
  {
    "product": "Limpa Nome",
    "stages": [
      {"id": "documentacao", "label": "Documentação", "color": "#F59E0B", "checkpoints": []},
      {"id": "protocolo", "label": "Protocolo", "color": "#6366f1", "checkpoints": []},
      {"id": "andamento", "label": "Em Andamento", "color": "#8B5CF6", "checkpoints": []},
      {"id": "concluido", "label": "Concluído", "color": "#10B981", "checkpoints": []}
    ],
    "timer_attention_days": 7,
    "timer_late_days": 30
  }
]'::jsonb
WHERE user_id = 'e843a629-ac44-41fa-a28e-9c3da861c9de';

-- 3. Update RPC get_public_service_flow to read from product_flows column
CREATE OR REPLACE FUNCTION public.get_public_service_flow(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant_id uuid;
  v_flows json;
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM public.leads
  WHERE tracking_token = p_token
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT ua.product_flows::json INTO v_flows
  FROM public.user_agents ua
  WHERE ua.user_id = v_tenant_id
  LIMIT 1;

  RETURN v_flows;
END;
$$;

-- 4. Create index for performance
CREATE INDEX IF NOT EXISTS idx_user_agents_product_flows ON public.user_agents USING gin (product_flows);

;
