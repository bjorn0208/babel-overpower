
-- =============================================================
-- Migration 14: Tabela llm_models + Seed das 5 IAs
-- Cada modelo tem custo real (OpenRouter) e preço de venda
-- =============================================================

CREATE TABLE IF NOT EXISTS llm_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'openrouter',
  model_id TEXT NOT NULL,
  cost_input_per_1m NUMERIC(10,4) NOT NULL DEFAULT 0,
  cost_output_per_1m NUMERIC(10,4) NOT NULL DEFAULT 0,
  sell_price_monthly INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE llm_models ENABLE ROW LEVEL SECURITY;

-- Todos podem ler (clientes precisam ver qual IA tem)
CREATE POLICY llm_models_select ON llm_models
  FOR SELECT USING (true);

-- Só admin gerencia
CREATE POLICY llm_models_manage ON llm_models
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- =====================
-- SEED: 5 IAs
-- Preços baseados no OpenRouter (fev/2026)
-- sell_price_monthly em centavos BRL
-- =====================

INSERT INTO llm_models (name, display_name, provider, model_id, cost_input_per_1m, cost_output_per_1m, sell_price_monthly, description, position) VALUES
  ('llama', 'Llama 3.3 70B', 'openrouter', 'meta-llama/llama-3.3-70b-instruct', 0.40, 0.40, 0, 'Meta Llama 3.3 — IA gratuita, ótima para atendimento básico', 1),
  ('qwen', 'Qwen 2.5 72B', 'openrouter', 'qwen/qwen-2.5-72b-instruct', 0.35, 0.40, 0, 'Alibaba Qwen 2.5 — Excelente custo-benefício', 2),
  ('chatgpt', 'ChatGPT (GPT-4o)', 'openrouter', 'openai/gpt-4o', 2.50, 10.00, 4990, 'OpenAI GPT-4o — IA mais popular do mundo', 3),
  ('claude-sonnet', 'Claude Sonnet 4.5', 'openrouter', 'anthropic/claude-sonnet-4-5-20250929', 3.00, 15.00, 7990, 'Anthropic Claude Sonnet — Inteligência avançada', 4),
  ('claude-opus', 'Claude Opus 4.5', 'openrouter', 'anthropic/claude-opus-4-5-20251101', 15.00, 75.00, 14990, 'Anthropic Claude Opus — A IA mais inteligente do mundo', 5);

;
