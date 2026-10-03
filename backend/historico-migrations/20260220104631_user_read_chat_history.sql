CREATE POLICY user_read_conversations ON conversations FOR SELECT TO authenticated
  USING (phone LIKE 'chat-test-%');

CREATE POLICY user_read_messages ON messages FOR SELECT TO authenticated
  USING (conversation_id IN (SELECT id FROM conversations WHERE phone LIKE 'chat-test-%'));

CREATE POLICY user_read_lead_cards ON lead_cards FOR SELECT TO authenticated
  USING (conversation_id IN (SELECT id FROM conversations WHERE phone LIKE 'chat-test-%'));
;
