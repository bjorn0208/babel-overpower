-- user_agents: membro de equipe le o agente do parent
DROP POLICY IF EXISTS user_read_own_agent ON user_agents;
CREATE POLICY user_read_own_agent ON user_agents FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.parent_user_id = user_agents.user_id
    )
  );

-- user_subscriptions: membro de equipe le o plano do parent
DROP POLICY IF EXISTS user_read_own_sub ON user_subscriptions;
CREATE POLICY user_read_own_sub ON user_subscriptions FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.parent_user_id = user_subscriptions.user_id
    )
  );

-- agent_templates: membro de equipe le o template do parent
DROP POLICY IF EXISTS user_read_own_template ON agent_templates;
CREATE POLICY user_read_own_template ON agent_templates FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_agents
      WHERE user_agents.template_id = agent_templates.id
        AND (
          user_agents.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.parent_user_id = user_agents.user_id
          )
        )
    )
  );

-- agent_templates: membro de equipe edita o template do parent
DROP POLICY IF EXISTS user_update_own_template ON agent_templates;
CREATE POLICY user_update_own_template ON agent_templates FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_agents
      WHERE user_agents.template_id = agent_templates.id
        AND (
          user_agents.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.parent_user_id = user_agents.user_id
          )
        )
    )
  );

-- conversations: membro de equipe le historico do parent
DROP POLICY IF EXISTS user_read_conversations ON conversations;
CREATE POLICY user_read_conversations ON conversations FOR SELECT TO authenticated
  USING (
    phone LIKE 'chat-test-%'
    AND EXISTS (
      SELECT 1 FROM user_agents ua
      WHERE conversations.phone LIKE 'chat-test-' || ua.template_id || '%'
        AND (
          ua.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.parent_user_id = ua.user_id
          )
        )
    )
  );

-- messages: idem
DROP POLICY IF EXISTS user_read_messages ON messages;
CREATE POLICY user_read_messages ON messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      JOIN user_agents ua ON c.phone LIKE 'chat-test-' || ua.template_id || '%'
      WHERE c.id = messages.conversation_id
        AND (
          ua.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.parent_user_id = ua.user_id
          )
        )
    )
  );

-- lead_cards: idem
DROP POLICY IF EXISTS user_read_lead_cards ON lead_cards;
CREATE POLICY user_read_lead_cards ON lead_cards FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      JOIN user_agents ua ON c.phone LIKE 'chat-test-' || ua.template_id || '%'
      WHERE c.id = lead_cards.conversation_id
        AND (
          ua.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.parent_user_id = ua.user_id
          )
        )
    )
  );
;
