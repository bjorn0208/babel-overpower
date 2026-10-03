
-- =============================================================
-- Migration 15: Adicionar llm_model_id aos agents
-- Cada agente pode ter uma IA diferente
-- Default: Llama (gratuito)
-- =============================================================

-- Adicionar coluna
ALTER TABLE agents ADD COLUMN IF NOT EXISTS llm_model_id UUID REFERENCES llm_models(id);

-- Setar default para Llama (gratuito) em agents existentes
UPDATE agents SET llm_model_id = (
  SELECT id FROM llm_models WHERE name = 'llama' LIMIT 1
) WHERE llm_model_id IS NULL;

-- Adicionar campo model na api_usage para rastrear qual modelo foi usado
ALTER TABLE api_usage ADD COLUMN IF NOT EXISTS model TEXT;

;
