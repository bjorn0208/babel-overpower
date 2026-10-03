
-- 1) Garante unicidade dos slugs (no-op se já existir)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'provedores_llm_slug_key'
  ) THEN
    ALTER TABLE public.provedores_llm ADD CONSTRAINT provedores_llm_slug_key UNIQUE (slug);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'modelos_llm_slug_key'
  ) THEN
    ALTER TABLE public.modelos_llm ADD CONSTRAINT modelos_llm_slug_key UNIQUE (slug);
  END IF;
END $$;

-- 2) Provedores
INSERT INTO public.provedores_llm (nome, slug, base_url, is_active)
SELECT v.nome, v.slug, v.base_url, true
FROM (VALUES
  ('OpenRouter', 'openrouter', 'https://openrouter.ai/api/v1'),
  ('Cohere',     'cohere',     'https://api.cohere.com/v1')
) AS v(nome, slug, base_url)
ON CONFLICT (slug) DO UPDATE SET base_url = EXCLUDED.base_url, is_active = true;

-- 3) Modelos
WITH p AS (SELECT id, slug FROM public.provedores_llm WHERE slug IN ('openrouter','cohere'))
INSERT INTO public.modelos_llm (provider_id, nome, slug, custo_input_1m, custo_output_1m, context_window, is_active)
SELECT p.id, m.nome, m.slug, m.ci, m.co, m.ctx, true
FROM (VALUES
  ('openrouter', 'Gemma 3 27B IT',         'google/gemma-3-27b-it',           0.10::numeric, 0.20::numeric, 131072),
  ('openrouter', 'Gemini 2.5 Flash',       'google/gemini-2.5-flash',         0.30::numeric, 2.50::numeric, 1048576),
  ('openrouter', 'Gemini 2.5 Pro',         'google/gemini-2.5-pro',           1.25::numeric, 10.00::numeric, 1048576),
  ('cohere',     'Embed Multilingual v3',  'cohere/embed-multilingual-v3.0',  0.10::numeric, 0.00::numeric, 512),
  ('cohere',     'Rerank Multilingual v3', 'cohere/rerank-multilingual-v3.0', 0.00::numeric, 0.00::numeric, 4096)
) AS m(prov_slug, nome, slug, ci, co, ctx)
JOIN p ON p.slug = m.prov_slug
ON CONFLICT (slug) DO UPDATE SET
  nome = EXCLUDED.nome,
  custo_input_1m = EXCLUDED.custo_input_1m,
  custo_output_1m = EXCLUDED.custo_output_1m,
  context_window = EXCLUDED.context_window,
  is_active = true;

-- 4) Defaults por tipologia nos cargos globais
UPDATE public.cargos SET modelo_llm_padrao = CASE tipologia
  WHEN 'atendimento'  THEN 'google/gemma-3-27b-it'
  WHEN 'face_cliente' THEN 'google/gemini-2.5-flash'
  WHEN 'mentor'       THEN 'google/gemini-2.5-pro'
  WHEN 'admin'        THEN 'google/gemini-2.5-flash'
END
WHERE escopo = 'global' AND modelo_llm_padrao IS NULL;

;
