INSERT INTO llm_models (provider_id, nome, slug, custo_input_1m, custo_output_1m, context_window, is_active)
VALUES
  ((SELECT id FROM llm_providers WHERE slug = 'openrouter'), 'Gemini 2.0 Flash (STT)', 'google/gemini-2.0-flash-001', 0.10, 0.40, 1000000, true),
  ((SELECT id FROM llm_providers WHERE slug = 'openrouter'), 'Qwen3 VL 32B (Visao)', 'qwen/qwen3-vl-32b-instruct', 0.104, 0.416, 32768, true);
;
