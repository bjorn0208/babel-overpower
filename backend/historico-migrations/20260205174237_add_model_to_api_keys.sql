
-- Adicionar campo model na tabela api_keys
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS model VARCHAR DEFAULT 'qwen/qwen-2.5-72b-instruct';

-- Adicionar configurações de custos por modelo
INSERT INTO system_settings (key, value, description) VALUES
('model_costs', '{
  "qwen/qwen-2.5-72b-instruct": {"input": 0.00000035, "output": 0.0000004, "name": "Qwen 2.5 72B"},
  "qwen/qwen-2.5-32b-instruct": {"input": 0.0000002, "output": 0.0000002, "name": "Qwen 2.5 32B"},
  "meta-llama/llama-3.3-70b-instruct": {"input": 0.0000004, "output": 0.0000004, "name": "Llama 3.3 70B"},
  "google/gemini-2.0-flash-001": {"input": 0.0000001, "output": 0.0000004, "name": "Gemini 2.0 Flash"},
  "llama-3.3-70b-versatile": {"input": 0, "output": 0, "name": "Llama 3.3 70B (Groq Free)"}
}', 'Custos por token de cada modelo (USD)')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

;
