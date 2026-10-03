
-- Change credits_per_message to numeric to support fractional values
-- (e.g. 0.1 means 10 msgs/credit, 3.0 means 3 credits/msg)
ALTER TABLE llm_models ALTER COLUMN credits_per_message TYPE numeric(10,4) USING credits_per_message::numeric(10,4);

-- Update credit_value_brl to R$ 1.00
UPDATE platform_configs SET value = '1.00' WHERE key = 'credit_value_brl';

-- Set initial values:
-- Economy: many msgs per credit (store as fraction)
UPDATE llm_models SET credits_per_message = 0.1000 WHERE name = 'Llama 3.3 70B';     -- 10 msgs/credito
UPDATE llm_models SET credits_per_message = 0.1250 WHERE name = 'Qwen 2.5 72B';      -- 8 msgs/credito
UPDATE llm_models SET credits_per_message = 0.2000 WHERE name = 'GPT-4o Mini';        -- 5 msgs/credito
-- Standard: few msgs per credit
UPDATE llm_models SET credits_per_message = 0.3333 WHERE name = 'Claude Haiku 4.5';   -- 3 msgs/credito
-- Premium: credits per message
UPDATE llm_models SET credits_per_message = 1.0000 WHERE name = 'GPT-4o';             -- 1 credito/msg
UPDATE llm_models SET credits_per_message = 1.0000 WHERE name = 'Claude Sonnet 4.5';  -- 1 credito/msg
UPDATE llm_models SET credits_per_message = 3.0000 WHERE name = 'Claude Opus 4.6';    -- 3 creditos/msg

;
