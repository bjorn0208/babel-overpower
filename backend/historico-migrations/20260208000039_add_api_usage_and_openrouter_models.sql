
-- 1. Tabela api_usage para rastreamento de uso da API
CREATE TABLE IF NOT EXISTS public.api_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  agent_id uuid REFERENCES public.agents(id),
  conversation_id uuid REFERENCES public.conversations(id),
  message_id uuid REFERENCES public.messages(id),
  llm_model_id uuid REFERENCES public.llm_models(id),
  openrouter_model text,
  token_input integer DEFAULT 0,
  token_output integer DEFAULT 0,
  total_tokens integer DEFAULT 0,
  cost_usd numeric DEFAULT 0,
  latency_ms integer DEFAULT 0,
  status text DEFAULT 'success',
  error_message text,
  created_at timestamptz DEFAULT now()
);

-- Indexes para consultas frequentes
CREATE INDEX idx_api_usage_tenant_id ON public.api_usage(tenant_id);
CREATE INDEX idx_api_usage_created_at ON public.api_usage(created_at DESC);
CREATE INDEX idx_api_usage_llm_model_id ON public.api_usage(llm_model_id);

-- RLS
ALTER TABLE public.api_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view api_usage" ON public.api_usage
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Service role can insert api_usage" ON public.api_usage
  FOR INSERT WITH CHECK (true);

-- 2. Adicionar modelos OpenRouter que faltam (Qwen 2.5 e Claude Opus)
INSERT INTO public.llm_models (slug, name, provider, openrouter_id, cost_per_input_token, cost_per_output_token, credits_per_1k_input, credits_per_1k_output, max_context_tokens, tier, is_active, sort_order)
VALUES 
  ('qwen-2.5-72b', 'Qwen 2.5 72B', 'qwen', 'qwen/qwen-2.5-72b-instruct', 0.00000027, 0.00000027, 1, 1, 32768, 'standard', true, 5),
  ('claude-opus-4-6', 'Claude Opus 4.6', 'anthropic', 'anthropic/claude-opus-4-6', 0.00001500, 0.00007500, 15, 75, 200000, 'premium', true, 6)
ON CONFLICT (slug) DO NOTHING;

-- 3. Salvar a API key do OpenRouter em platform_configs
INSERT INTO public.platform_configs (key, value, value_type, description, is_tenant_overridable)
VALUES (
  'openrouter_api_key',
  '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',
  'secret',
  'Chave de API do OpenRouter para chamadas LLM',
  false
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- 4. Adicionar config de cotacao USD/BRL
INSERT INTO public.platform_configs (key, value, value_type, description, is_tenant_overridable)
VALUES (
  'usd_brl_rate',
  '5.80',
  'number',
  'Cotacao USD para BRL para calculo de custos',
  false
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

;
