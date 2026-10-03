
CREATE TABLE user_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES agent_templates(id) ON DELETE CASCADE,
  nome_agente text NOT NULL DEFAULT '',
  razao_social text NOT NULL DEFAULT '',
  cnpj text NOT NULL DEFAULT '',
  pix text NOT NULL DEFAULT '',
  anos_empresa integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE user_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_user_agents" ON user_agents
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "admin_user_agents" ON user_agents
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role = 'platform_admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role = 'platform_admin')
  );

CREATE POLICY "user_read_own_agent" ON user_agents
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER set_updated_at_user_agents
  BEFORE UPDATE ON user_agents
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

;
