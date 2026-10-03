
-- Usuario pode ler modelos LLM ativos
CREATE POLICY "user_read_llm_models" ON llm_models
  FOR SELECT TO authenticated
  USING (is_active = true);

-- Fix: INSERT em agent_templates precisa de SELECT pro RETURNING
-- Dropar e recriar com policy mais permissiva pro SELECT no insert
DROP POLICY "user_insert_template" ON agent_templates;

CREATE POLICY "user_insert_template" ON agent_templates
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Permitir SELECT temporario durante INSERT (RETURNING)
-- Ajustar read policy pra incluir templates que o usuario acabou de criar
DROP POLICY "user_read_own_template" ON agent_templates;

CREATE POLICY "user_read_own_template" ON agent_templates
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_agents WHERE user_agents.template_id = agent_templates.id AND user_agents.user_id = auth.uid())
    OR id IN (SELECT agent_templates.id)
  );

;
