-- Conversations: user so le chats do proprio agente
DROP POLICY IF EXISTS user_read_conversations ON conversations;
CREATE POLICY user_read_conversations ON conversations FOR SELECT TO authenticated
  USING (
    phone LIKE 'chat-test-%'
    AND EXISTS (
      SELECT 1 FROM user_agents
      WHERE user_agents.user_id = auth.uid()
        AND conversations.phone LIKE 'chat-test-' || user_agents.template_id || '%'
    )
  );

-- Messages: user so le msgs de conversas do proprio agente
DROP POLICY IF EXISTS user_read_messages ON messages;
CREATE POLICY user_read_messages ON messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      JOIN user_agents ua ON c.phone LIKE 'chat-test-' || ua.template_id || '%'
      WHERE c.id = messages.conversation_id
        AND ua.user_id = auth.uid()
    )
  );

-- Lead cards: idem
DROP POLICY IF EXISTS user_read_lead_cards ON lead_cards;
CREATE POLICY user_read_lead_cards ON lead_cards FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      JOIN user_agents ua ON c.phone LIKE 'chat-test-' || ua.template_id || '%'
      WHERE c.id = lead_cards.conversation_id
        AND ua.user_id = auth.uid()
    )
  );
;
