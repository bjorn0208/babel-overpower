-- Cadastrar Llama 3.3 70B
INSERT INTO llm_models (id, provider_id, nome, slug, custo_input_1m, custo_output_1m, context_window, is_active)
VALUES (gen_random_uuid(), '149d5e62-e783-41d7-a5c5-fe296137c52f', 'Llama 3.3 70B', 'meta-llama/llama-3.3-70b-instruct', 0.12, 0.39, 131072, true);

-- Atualizar Plano 1 para usar Llama 3.3 70B
UPDATE store_planos
SET modelo_llm_id = (SELECT id FROM llm_models WHERE slug = 'meta-llama/llama-3.3-70b-instruct')
WHERE id = '842b56b9-521c-4c7a-996c-9e4d5c991a1f';
;
