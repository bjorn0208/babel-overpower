ALTER TABLE user_agents ADD COLUMN IF NOT EXISTS source_template_id uuid REFERENCES agent_templates(id);
;
