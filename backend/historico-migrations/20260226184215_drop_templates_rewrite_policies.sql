
-- 1. Dropar policies que referenciam template_id
DROP POLICY IF EXISTS user_read_own_template ON agent_templates;
DROP POLICY IF EXISTS user_update_own_template ON agent_templates;
DROP POLICY IF EXISTS user_read_own_chunks ON knowledge_chunks;
DROP POLICY IF EXISTS user_read_conversations ON conversations;
DROP POLICY IF EXISTS user_read_messages ON messages;
DROP POLICY IF EXISTS user_read_lead_cards ON lead_cards;

-- 2. Recriar policies usando user_agents.id em vez de template_id
CREATE POLICY user_read_own_chunks ON knowledge_chunks FOR SELECT TO authenticated
USING (agent_id IN (SELECT ua.id FROM user_agents ua WHERE ua.user_id = (SELECT auth.uid())));

CREATE POLICY user_read_conversations ON conversations FOR SELECT TO authenticated
USING (
  phone LIKE 'chat-test-%' AND EXISTS (
    SELECT 1 FROM user_agents ua
    WHERE conversations.phone LIKE ('chat-test-' || ua.id || '%')
    AND (ua.user_id = (SELECT auth.uid()) OR EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.parent_user_id = ua.user_id
    ))
  )
);

CREATE POLICY user_read_messages ON messages FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM conversations c
  JOIN user_agents ua ON (c.phone LIKE ('chat-test-' || ua.id || '%'))
  WHERE c.id = messages.conversation_id
  AND (ua.user_id = (SELECT auth.uid()) OR EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.parent_user_id = ua.user_id
  ))
));

CREATE POLICY user_read_lead_cards ON lead_cards FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM conversations c
  JOIN user_agents ua ON (c.phone LIKE ('chat-test-' || ua.id || '%'))
  WHERE c.id = lead_cards.conversation_id
  AND (ua.user_id = (SELECT auth.uid()) OR EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.parent_user_id = ua.user_id
  ))
));

-- 3. Dropar FK e coluna template_id
ALTER TABLE user_agents DROP CONSTRAINT IF EXISTS user_agents_template_id_fkey;
ALTER TABLE user_agents DROP COLUMN IF EXISTS template_id;

-- 4. Dropar RPC activate_template
DROP FUNCTION IF EXISTS activate_template(uuid, uuid);

-- 5. Dropar tabelas de templates
DROP TABLE IF EXISTS admin_templates CASCADE;
DROP TABLE IF EXISTS agent_templates CASCADE;

;
