-- Garante slug único antes de inserir (idempotente)
INSERT INTO public.modelos_llm (provider_id, nome, slug, custo_input_1m, custo_output_1m, context_window, is_active, is_default)
VALUES (
  '149d5e62-e783-41d7-a5c5-fe296137c52f',
  'Gemini 3.1 Flash Lite',
  'google/gemini-3.1-flash-lite',
  0.25,
  1.50,
  1048576,
  true,
  false
)
ON CONFLICT (slug) DO UPDATE SET
  nome = EXCLUDED.nome,
  custo_input_1m = EXCLUDED.custo_input_1m,
  custo_output_1m = EXCLUDED.custo_output_1m,
  context_window = EXCLUDED.context_window,
  is_active = true,
  updated_at = now();

UPDATE public.modelos_llm SET is_default = false WHERE is_default = true;
UPDATE public.modelos_llm SET is_default = true WHERE slug = 'google/gemini-3.1-flash-lite';
;
