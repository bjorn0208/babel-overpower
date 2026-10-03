
-- ============================================================
-- 009 LLM_MODELS
-- ============================================================

CREATE TABLE llm_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  openrouter_id TEXT NOT NULL,
  cost_per_input_token DECIMAL(12,8) NOT NULL,
  cost_per_output_token DECIMAL(12,8) NOT NULL,
  credits_per_1k_input INTEGER NOT NULL,
  credits_per_1k_output INTEGER NOT NULL,
  max_context_tokens INTEGER NOT NULL DEFAULT 4096,
  tier TEXT NOT NULL DEFAULT 'standard',
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE llm_models IS 'Modelos LLM disponiveis. Cada um com custo real (USD) e custo em creditos.';

CREATE TRIGGER trg_llm_models_updated_at
  BEFORE UPDATE ON llm_models
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

INSERT INTO llm_models (slug, name, provider, openrouter_id, cost_per_input_token, cost_per_output_token, credits_per_1k_input, credits_per_1k_output, max_context_tokens, tier, sort_order) VALUES
  ('llama-3.3-70b', 'Llama 3.3 70B', 'meta', 'meta-llama/llama-3.3-70b-instruct', 0.00000023, 0.00000040, 1, 2, 131072, 'economy', 1),
  ('gpt-4o-mini', 'GPT-4o Mini', 'openai', 'openai/gpt-4o-mini', 0.00000015, 0.00000060, 2, 4, 128000, 'standard', 2),
  ('claude-haiku-4-5', 'Claude Haiku 4.5', 'anthropic', 'anthropic/claude-haiku-4-5-20251001', 0.00000080, 0.00000400, 3, 6, 200000, 'standard', 3),
  ('gpt-4o', 'GPT-4o', 'openai', 'openai/gpt-4o', 0.00000250, 0.00001000, 8, 15, 128000, 'premium', 4),
  ('claude-sonnet-4-5', 'Claude Sonnet 4.5', 'anthropic', 'anthropic/claude-sonnet-4-5-20250929', 0.00000300, 0.00001500, 10, 20, 200000, 'premium', 5);

CREATE OR REPLACE FUNCTION calculate_credits(
  _llm_model_id UUID,
  _tokens_input INTEGER,
  _tokens_output INTEGER
)
RETURNS TABLE (
  credits_input INTEGER,
  credits_output INTEGER,
  credits_total INTEGER,
  cost_usd_input DECIMAL(10,6),
  cost_usd_output DECIMAL(10,6),
  cost_usd_total DECIMAL(10,6)
) AS $$
DECLARE
  _model RECORD;
BEGIN
  SELECT * INTO _model FROM llm_models WHERE id = _llm_model_id;

  IF _model IS NULL THEN
    RAISE EXCEPTION 'Modelo LLM nao encontrado: %', _llm_model_id;
  END IF;

  credits_input := CEIL(_tokens_input::DECIMAL / 1000 * _model.credits_per_1k_input);
  credits_output := CEIL(_tokens_output::DECIMAL / 1000 * _model.credits_per_1k_output);
  credits_total := credits_input + credits_output;

  cost_usd_input := _tokens_input * _model.cost_per_input_token;
  cost_usd_output := _tokens_output * _model.cost_per_output_token;
  cost_usd_total := cost_usd_input + cost_usd_output;

  RETURN NEXT;
END;
$$ LANGUAGE plpgsql STABLE;

;
