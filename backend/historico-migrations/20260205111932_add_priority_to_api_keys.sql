
-- Adicionar coluna priority que está faltando
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0;

-- Atualizar a key existente
UPDATE public.api_keys SET priority = 1 WHERE provider = 'openrouter';

;
