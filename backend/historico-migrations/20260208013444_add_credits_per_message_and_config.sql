
-- Add credits_per_message to llm_models for simpler credit calculation
ALTER TABLE llm_models ADD COLUMN IF NOT EXISTS credits_per_message integer DEFAULT 1;

-- Set initial values based on tier
UPDATE llm_models SET credits_per_message = 1 WHERE tier = 'economy';
UPDATE llm_models SET credits_per_message = 1 WHERE tier = 'standard';
UPDATE llm_models SET credits_per_message = 2 WHERE name IN ('GPT-4o', 'Claude Sonnet 4.5');
UPDATE llm_models SET credits_per_message = 3 WHERE name = 'Claude Opus 4.6';

-- Add credit_value_brl to platform_configs
INSERT INTO platform_configs (key, value, description)
VALUES ('credit_value_brl', '0.05', 'Valor de 1 credito em reais (R$)')
ON CONFLICT (key) DO NOTHING;

-- Add avg_tokens_per_message config
INSERT INTO platform_configs (key, value, description)
VALUES ('avg_tokens_input', '600', 'Media de tokens de input por mensagem')
ON CONFLICT (key) DO NOTHING;

INSERT INTO platform_configs (key, value, description)
VALUES ('avg_tokens_output', '200', 'Media de tokens de output por mensagem')
ON CONFLICT (key) DO NOTHING;

;
