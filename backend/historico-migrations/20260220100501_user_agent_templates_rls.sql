
-- Usuario pode ler templates vinculados a ele
CREATE POLICY "user_read_own_template" ON agent_templates
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_agents WHERE user_agents.template_id = agent_templates.id AND user_agents.user_id = auth.uid())
  );

-- Usuario pode criar templates (auto-criacao quando nao tem)
CREATE POLICY "user_insert_template" ON agent_templates
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Usuario pode editar templates vinculados a ele
CREATE POLICY "user_update_own_template" ON agent_templates
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_agents WHERE user_agents.template_id = agent_templates.id AND user_agents.user_id = auth.uid())
  );

-- Usuario pode inserir em user_agents (auto-vinculo)
CREATE POLICY "user_insert_own_agent" ON user_agents
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

;
