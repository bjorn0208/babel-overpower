-- ================================================================================
-- SAAS AGENT IA WHITE LABEL - RLS POLICIES
-- ================================================================================

-- HABILITAR RLS EM TODAS AS TABELAS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE quick_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_buttons ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE unanswered_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE special_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE special_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;

-- PROFILES
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "Admin can manage all profiles" ON profiles;
CREATE POLICY "Admin can manage all profiles" ON profiles
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- AGENTS
DROP POLICY IF EXISTS "Users can view own agents" ON agents;
CREATE POLICY "Users can view own agents" ON agents
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "Users can create own agents" ON agents;
CREATE POLICY "Users can create own agents" ON agents
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "Users can update own agents" ON agents;
CREATE POLICY "Users can update own agents" ON agents
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "Users can delete own agents" ON agents;
CREATE POLICY "Users can delete own agents" ON agents
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "Public can view active agents" ON agents;
CREATE POLICY "Public can view active agents" ON agents
  FOR SELECT TO anon
  USING (is_active = true);

-- STORES
DROP POLICY IF EXISTS "Users can manage own stores" ON stores;
CREATE POLICY "Users can manage own stores" ON stores
  FOR ALL TO authenticated
  USING (
    agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
    OR is_admin()
  )
  WITH CHECK (
    agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
    OR is_admin()
  );

DROP POLICY IF EXISTS "Admin can manage all stores" ON stores;
CREATE POLICY "Admin can manage all stores" ON stores
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Public can view active stores" ON stores;
CREATE POLICY "Public can view active stores" ON stores
  FOR SELECT
  USING (
    is_active = true
    AND agent_id IN (SELECT id FROM agents WHERE is_active = true)
  );

-- CONVERSATIONS
DROP POLICY IF EXISTS "Owner can view own agent conversations" ON conversations;
CREATE POLICY "Owner can view own agent conversations" ON conversations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM agents
      WHERE agents.id = conversations.agent_id
      AND agents.user_id = auth.uid()
    )
    OR is_admin()
  );

DROP POLICY IF EXISTS "Owner can insert conversations" ON conversations;
CREATE POLICY "Owner can insert conversations" ON conversations
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM agents
      WHERE agents.id = agent_id
      AND agents.user_id = auth.uid()
    )
    OR is_admin()
  );

DROP POLICY IF EXISTS "Owner can update own conversations" ON conversations;
CREATE POLICY "Owner can update own conversations" ON conversations
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM agents
      WHERE agents.id = conversations.agent_id
      AND agents.user_id = auth.uid()
    )
    OR is_admin()
  );

DROP POLICY IF EXISTS "Owner can delete own conversations" ON conversations;
CREATE POLICY "Owner can delete own conversations" ON conversations
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM agents
      WHERE agents.id = conversations.agent_id
      AND agents.user_id = auth.uid()
    )
    OR is_admin()
  );

-- MESSAGES
DROP POLICY IF EXISTS "Owner can view own agent messages" ON messages;
CREATE POLICY "Owner can view own agent messages" ON messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      JOIN agents a ON a.id = c.agent_id
      WHERE c.id = messages.conversation_id
      AND a.user_id = auth.uid()
    )
    OR is_admin()
  );

DROP POLICY IF EXISTS "Owner can insert messages" ON messages;
CREATE POLICY "Owner can insert messages" ON messages
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations c
      JOIN agents a ON a.id = c.agent_id
      WHERE c.id = conversation_id
      AND a.user_id = auth.uid()
    )
    OR is_admin()
  );

DROP POLICY IF EXISTS "Owner can update messages" ON messages;
CREATE POLICY "Owner can update messages" ON messages
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      JOIN agents a ON a.id = c.agent_id
      WHERE c.id = messages.conversation_id
      AND a.user_id = auth.uid()
    )
    OR is_admin()
  );

DROP POLICY IF EXISTS "Owner can delete messages" ON messages;
CREATE POLICY "Owner can delete messages" ON messages
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      JOIN agents a ON a.id = c.agent_id
      WHERE c.id = messages.conversation_id
      AND a.user_id = auth.uid()
    )
    OR is_admin()
  );

-- KNOWLEDGE_ITEMS
DROP POLICY IF EXISTS "Users can manage own knowledge" ON knowledge_items;
CREATE POLICY "Users can manage own knowledge" ON knowledge_items
  FOR ALL TO authenticated
  USING (
    agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
    OR is_admin()
  )
  WITH CHECK (
    agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
    OR is_admin()
  );

-- QUICK_ACTIONS
DROP POLICY IF EXISTS "Users can manage own quick_actions" ON quick_actions;
CREATE POLICY "Users can manage own quick_actions" ON quick_actions
  FOR ALL TO authenticated
  USING (
    agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
    OR is_admin()
  )
  WITH CHECK (
    agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
    OR is_admin()
  );

-- CUSTOM_BUTTONS
DROP POLICY IF EXISTS "Users can manage own custom_buttons" ON custom_buttons;
CREATE POLICY "Users can manage own custom_buttons" ON custom_buttons
  FOR ALL TO authenticated
  USING (
    agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
    OR is_admin()
  )
  WITH CHECK (
    agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
    OR is_admin()
  );

-- SECURITY_PATTERNS
DROP POLICY IF EXISTS "Only admin can view security_patterns" ON security_patterns;
CREATE POLICY "Only admin can view security_patterns" ON security_patterns
  FOR SELECT TO authenticated
  USING (is_admin());

DROP POLICY IF EXISTS "Only admin can manage security_patterns" ON security_patterns;
CREATE POLICY "Only admin can manage security_patterns" ON security_patterns
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- SECURITY_INCIDENTS
DROP POLICY IF EXISTS "Admin can view all incidents" ON security_incidents;
CREATE POLICY "Admin can view all incidents" ON security_incidents
  FOR SELECT TO authenticated
  USING (is_admin());

DROP POLICY IF EXISTS "System can insert incidents" ON security_incidents;
CREATE POLICY "System can insert incidents" ON security_incidents
  FOR INSERT TO authenticated, anon
  WITH CHECK (true);

-- VERIFICATION_RESPONSES
DROP POLICY IF EXISTS "Admin can manage verification_responses" ON verification_responses;
CREATE POLICY "Admin can manage verification_responses" ON verification_responses
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Public can read verification_responses" ON verification_responses;
CREATE POLICY "Public can read verification_responses" ON verification_responses
  FOR SELECT
  USING (is_active = true);

-- UNANSWERED_QUESTIONS
DROP POLICY IF EXISTS "Users can view own unanswered" ON unanswered_questions;
CREATE POLICY "Users can view own unanswered" ON unanswered_questions
  FOR SELECT TO authenticated
  USING (
    agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
    OR is_admin()
  );

DROP POLICY IF EXISTS "Users can manage own unanswered" ON unanswered_questions;
CREATE POLICY "Users can manage own unanswered" ON unanswered_questions
  FOR ALL TO authenticated
  USING (
    agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
    OR is_admin()
  )
  WITH CHECK (
    agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
    OR is_admin()
  );

-- API_KEYS
DROP POLICY IF EXISTS "Admin can manage api_keys" ON api_keys;
CREATE POLICY "Admin can manage api_keys" ON api_keys
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- API_USAGE
DROP POLICY IF EXISTS "Admin can view all api_usage" ON api_usage;
CREATE POLICY "Admin can view all api_usage" ON api_usage
  FOR SELECT TO authenticated
  USING (is_admin() OR user_id = auth.uid());

DROP POLICY IF EXISTS "System can insert api_usage" ON api_usage;
CREATE POLICY "System can insert api_usage" ON api_usage
  FOR INSERT TO authenticated, anon
  WITH CHECK (true);

-- PLANS
DROP POLICY IF EXISTS "Everyone can view active plans" ON plans;
CREATE POLICY "Everyone can view active plans" ON plans
  FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "Admin can manage plans" ON plans;
CREATE POLICY "Admin can manage plans" ON plans
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- SUBSCRIPTIONS
DROP POLICY IF EXISTS "Users can view own subscriptions" ON subscriptions;
CREATE POLICY "Users can view own subscriptions" ON subscriptions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "Admin can manage subscriptions" ON subscriptions;
CREATE POLICY "Admin can manage subscriptions" ON subscriptions
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ANALYTICS_DAILY
DROP POLICY IF EXISTS "Users can view own analytics" ON analytics_daily;
CREATE POLICY "Users can view own analytics" ON analytics_daily
  FOR SELECT TO authenticated
  USING (
    agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
    OR is_admin()
  );

-- TENANT_PERMISSIONS
DROP POLICY IF EXISTS "Admin can manage tenant permissions" ON tenant_permissions;
CREATE POLICY "Admin can manage tenant permissions" ON tenant_permissions
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Users can view own permissions" ON tenant_permissions;
CREATE POLICY "Users can view own permissions" ON tenant_permissions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- TENANT_QUOTAS
DROP POLICY IF EXISTS "Admin can manage tenant quotas" ON tenant_quotas;
CREATE POLICY "Admin can manage tenant quotas" ON tenant_quotas
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Users can view own quotas" ON tenant_quotas;
CREATE POLICY "Users can view own quotas" ON tenant_quotas
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- SYSTEM_SETTINGS
DROP POLICY IF EXISTS "Admin can manage settings" ON system_settings;
CREATE POLICY "Admin can manage settings" ON system_settings
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Public can read settings" ON system_settings;
CREATE POLICY "Public can read settings" ON system_settings
  FOR SELECT TO authenticated
  USING (true);

-- SPECIAL_HOURS
DROP POLICY IF EXISTS "Users can manage own special_hours" ON special_hours;
CREATE POLICY "Users can manage own special_hours" ON special_hours
  FOR ALL TO authenticated
  USING (
    store_id IN (
      SELECT s.id FROM stores s
      JOIN agents a ON a.id = s.agent_id
      WHERE a.user_id = auth.uid()
    )
    OR is_admin()
  )
  WITH CHECK (
    store_id IN (
      SELECT s.id FROM stores s
      JOIN agents a ON a.id = s.agent_id
      WHERE a.user_id = auth.uid()
    )
    OR is_admin()
  );

DROP POLICY IF EXISTS "Admin can manage all special_hours" ON special_hours;
CREATE POLICY "Admin can manage all special_hours" ON special_hours
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- SPECIAL_EVENTS
DROP POLICY IF EXISTS "Users can manage own special_events" ON special_events;
CREATE POLICY "Users can manage own special_events" ON special_events
  FOR ALL TO authenticated
  USING (
    agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
    OR is_admin()
  )
  WITH CHECK (
    agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
    OR is_admin()
  );

DROP POLICY IF EXISTS "Admin can manage all special_events" ON special_events;
CREATE POLICY "Admin can manage all special_events" ON special_events
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- SUPPORT_MESSAGES
DROP POLICY IF EXISTS "Users can view own support messages" ON support_messages;
CREATE POLICY "Users can view own support messages" ON support_messages
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "Users can create support messages" ON support_messages;
CREATE POLICY "Users can create support messages" ON support_messages
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Admin can manage all support messages" ON support_messages;
CREATE POLICY "Admin can manage all support messages" ON support_messages
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
;
