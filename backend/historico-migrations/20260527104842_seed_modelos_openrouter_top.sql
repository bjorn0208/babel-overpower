
-- Popula modelos_llm com top OpenRouter atuais (preços 2026-05 públicos OpenRouter).
-- provedor openrouter id = 149d5e62-e783-41d7-a5c5-fe296137c52f

WITH provider AS (
  SELECT id FROM public.provedores_llm WHERE slug = 'openrouter' LIMIT 1
)
INSERT INTO public.modelos_llm (provider_id, nome, slug, custo_input_1m, custo_output_1m, context_window, is_active, is_default)
SELECT provider.id, nome, slug, custo_in, custo_out, ctx, true, false
FROM provider, (VALUES
  -- Anthropic (4.5 family — Opus + Sonnet + Haiku)
  ('Claude Opus 4.5',    'anthropic/claude-opus-4.5',     15.00, 75.00, 200000),
  ('Claude Sonnet 4.5',  'anthropic/claude-sonnet-4.5',    3.00, 15.00, 200000),
  -- OpenAI (GPT-5 family + o3 reasoning)
  ('GPT-5',              'openai/gpt-5',                   2.50, 10.00, 400000),
  ('GPT-5 mini',         'openai/gpt-5-mini',              0.25,  2.00, 400000),
  ('o3',                 'openai/o3',                      2.00,  8.00, 200000),
  ('o3 mini',            'openai/o3-mini',                 1.10,  4.40, 200000),
  -- Google Gemini (faltavam — flash-lite + outras variantes)
  ('Gemini 2.5 Flash-Lite', 'google/gemini-2.5-flash-lite', 0.10, 0.40, 1048576),
  ('Gemini 3.1 Pro',     'google/gemini-3.1-pro',          5.00, 30.00, 2000000),
  ('Gemini 3.1 Flash',   'google/gemini-3.1-flash',        0.50,  4.00, 1048576),
  -- Gemma
  ('Gemma 3 27B IT',     'google/gemma-3-27b-it',          0.08,  0.30, 131072),
  ('Gemma 4 31B IT',     'google/gemma-4-31b-it',          0.10,  0.40, 131072),
  -- DeepSeek (V3.1 + R1)
  ('DeepSeek V3.1',      'deepseek/deepseek-v3.1',         0.27,  1.10, 128000),
  ('DeepSeek R1',        'deepseek/deepseek-r1',           0.55,  2.19, 128000),
  -- xAI
  ('Grok 4',             'x-ai/grok-4',                    5.00, 15.00, 256000),
  -- Qwen
  ('Qwen3 72B Instruct', 'qwen/qwen3-72b-instruct',        0.40,  1.20, 131072),
  -- Meta
  ('Llama 4 405B',       'meta-llama/llama-4-405b-instruct', 3.50, 10.50, 128000),
  ('Llama 4 70B',        'meta-llama/llama-4-70b-instruct', 0.50,  1.50, 128000),
  -- Mistral
  ('Mistral Large 3',    'mistralai/mistral-large-3',      2.00,  6.00, 128000)
) AS m(nome, slug, custo_in, custo_out, ctx)
WHERE NOT EXISTS (
  SELECT 1 FROM public.modelos_llm WHERE slug = m.slug
);

-- Garantir gemini-2.5-pro como default (cargo Curadoria usa)
UPDATE public.modelos_llm SET is_default = true
WHERE slug = 'google/gemini-2.5-pro'
  AND NOT EXISTS (SELECT 1 FROM public.modelos_llm WHERE is_default = true);

;
