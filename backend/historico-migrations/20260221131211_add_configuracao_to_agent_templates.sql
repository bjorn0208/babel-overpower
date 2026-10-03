ALTER TABLE agent_templates ADD COLUMN IF NOT EXISTS configuracao jsonb DEFAULT '{}'::jsonb;
;
