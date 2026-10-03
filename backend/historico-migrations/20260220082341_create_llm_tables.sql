
-- Provedores de API (OpenRouter, etc)
CREATE TABLE llm_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  slug text NOT NULL UNIQUE,
  base_url text NOT NULL DEFAULT 'https://openrouter.ai/api/v1',
  api_key text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE llm_providers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_llm_providers" ON llm_providers FOR ALL USING (public.is_platform_admin());

-- Modelos LLM disponiveis
CREATE TABLE llm_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES llm_providers(id) ON DELETE CASCADE,
  nome text NOT NULL,
  slug text NOT NULL,
  custo_input_1m numeric(10,4) NOT NULL DEFAULT 0,
  custo_output_1m numeric(10,4) NOT NULL DEFAULT 0,
  context_window integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider_id, slug)
);

ALTER TABLE llm_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_llm_models" ON llm_models FOR ALL USING (public.is_platform_admin());

-- Logs de requisicoes LLM
CREATE TABLE llm_request_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id uuid REFERENCES llm_models(id) ON DELETE SET NULL,
  provider_id uuid REFERENCES llm_providers(id) ON DELETE SET NULL,
  model_slug text NOT NULL DEFAULT '',
  provider_nome text NOT NULL DEFAULT '',
  tokens_input integer NOT NULL DEFAULT 0,
  tokens_output integer NOT NULL DEFAULT 0,
  custo_total numeric(12,6) NOT NULL DEFAULT 0,
  tipo text NOT NULL DEFAULT 'test',
  status text NOT NULL DEFAULT 'success',
  duracao_ms integer NOT NULL DEFAULT 0,
  erro text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE llm_request_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_llm_request_logs" ON llm_request_logs FOR ALL USING (public.is_platform_admin());

-- Indice para queries de custo por periodo
CREATE INDEX idx_llm_logs_created ON llm_request_logs(created_at DESC);
CREATE INDEX idx_llm_logs_model ON llm_request_logs(model_id);

-- Inserir OpenRouter como provider padrao
INSERT INTO llm_providers (nome, slug, base_url, api_key)
VALUES ('OpenRouter', 'openrouter', 'https://openrouter.ai/api/v1', '');

-- Inserir os 3 modelos com custos reais do OpenRouter
INSERT INTO llm_models (provider_id, nome, slug, custo_input_1m, custo_output_1m, context_window)
SELECT
  p.id,
  m.nome,
  m.slug,
  m.custo_input,
  m.custo_output,
  m.ctx
FROM llm_providers p
CROSS JOIN (VALUES
  ('Qwen 2.5 72B', 'qwen/qwen-2.5-72b-instruct', 0.12, 0.39, 32768),
  ('GPT-4.1', 'openai/gpt-4.1', 2.00, 8.00, 1047576),
  ('Claude Sonnet 4.5', 'anthropic/claude-sonnet-4.5', 3.00, 15.00, 1000000)
) AS m(nome, slug, custo_input, custo_output, ctx)
WHERE p.slug = 'openrouter';

;
