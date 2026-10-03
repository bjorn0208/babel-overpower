
-- Corrigir policy de leitura (a anterior ficou muito aberta)
DROP POLICY "user_read_own_template" ON agent_templates;

CREATE POLICY "user_read_own_template" ON agent_templates
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_agents WHERE user_agents.template_id = agent_templates.id AND user_agents.user_id = auth.uid())
  );

;
