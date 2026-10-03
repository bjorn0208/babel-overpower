
-- ===============================================
-- MIGRATION: RLS POLICIES
-- ===============================================

-- Habilitar RLS em todas as tabelas
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE quick_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_buttons ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE special_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE special_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE unanswered_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_quotas ENABLE ROW LEVEL SECURITY;

-- ==================== PROFILES ====================
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admin can view all profiles" ON profiles FOR SELECT USING (is_admin());
CREATE POLICY "Admin can update all profiles" ON profiles FOR UPDATE USING (is_admin());

-- ==================== PLANS ====================
CREATE POLICY "Anyone can view active plans" ON plans FOR SELECT USING (is_active = true);
CREATE POLICY "Admin can manage plans" ON plans FOR ALL USING (is_admin());

-- ==================== SUBSCRIPTIONS ====================
CREATE POLICY "Users can view own subscription" ON subscriptions FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can update own subscription" ON subscriptions FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Admin can manage all subscriptions" ON subscriptions FOR ALL USING (is_admin());

-- ==================== AGENTS ====================
CREATE POLICY "Users can view own agent" ON agents FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can update own agent" ON agents FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users can insert own agent" ON agents FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own agent" ON agents FOR DELETE USING (user_id = auth.uid());
CREATE POLICY "Admin can manage all agents" ON agents FOR ALL USING (is_admin());
CREATE POLICY "Public can view agents by slug" ON agents FOR SELECT USING (public_slug IS NOT NULL AND is_active = true);

-- ==================== STORES ====================
CREATE POLICY "Users can view own stores" ON stores FOR SELECT USING (agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()));
CREATE POLICY "Users can manage own stores" ON stores FOR ALL USING (agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()));
CREATE POLICY "Admin can manage all stores" ON stores FOR ALL USING (is_admin());
CREATE POLICY "Public can view active stores" ON stores FOR SELECT USING (is_active = true);

-- ==================== KNOWLEDGE_ITEMS ====================
CREATE POLICY "Users can view own knowledge" ON knowledge_items FOR SELECT USING (agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()));
CREATE POLICY "Users can manage own knowledge" ON knowledge_items FOR ALL USING (agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()));
CREATE POLICY "Admin can manage all knowledge" ON knowledge_items FOR ALL USING (is_admin());
CREATE POLICY "Public can view active knowledge" ON knowledge_items FOR SELECT USING (is_active = true);

-- ==================== QUICK_ACTIONS ====================
CREATE POLICY "Users can view own quick_actions" ON quick_actions FOR SELECT USING (agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()));
CREATE POLICY "Users can manage own quick_actions" ON quick_actions FOR ALL USING (agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()));
CREATE POLICY "Admin can manage all quick_actions" ON quick_actions FOR ALL USING (is_admin());
CREATE POLICY "Public can view active quick_actions" ON quick_actions FOR SELECT USING (is_active = true);

-- ==================== CUSTOM_BUTTONS ====================
CREATE POLICY "Users can view own custom_buttons" ON custom_buttons FOR SELECT USING (agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()));
CREATE POLICY "Users can manage own custom_buttons" ON custom_buttons FOR ALL USING (agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()));
CREATE POLICY "Admin can manage all custom_buttons" ON custom_buttons FOR ALL USING (is_admin());
CREATE POLICY "Public can view active custom_buttons" ON custom_buttons FOR SELECT USING (is_active = true);

-- ==================== CONVERSATIONS ====================
CREATE POLICY "Users can view own conversations" ON conversations FOR SELECT USING (agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()));
CREATE POLICY "Users can manage own conversations" ON conversations FOR ALL USING (agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()));
CREATE POLICY "Admin can manage all conversations" ON conversations FOR ALL USING (is_admin());
CREATE POLICY "Service role can manage conversations" ON conversations FOR ALL USING (auth.role() = 'service_role');

-- ==================== MESSAGES ====================
CREATE POLICY "Users can view own messages" ON messages FOR SELECT USING (
  conversation_id IN (
    SELECT c.id FROM conversations c 
    JOIN agents a ON c.agent_id = a.id 
    WHERE a.user_id = auth.uid()
  )
);
CREATE POLICY "Users can insert messages" ON messages FOR INSERT WITH CHECK (
  conversation_id IN (
    SELECT c.id FROM conversations c 
    JOIN agents a ON c.agent_id = a.id 
    WHERE a.user_id = auth.uid()
  )
);
CREATE POLICY "Admin can manage all messages" ON messages FOR ALL USING (is_admin());
CREATE POLICY "Service role can manage messages" ON messages FOR ALL USING (auth.role() = 'service_role');

-- ==================== ANALYTICS_DAILY ====================
CREATE POLICY "Users can view own analytics" ON analytics_daily FOR SELECT USING (agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()));
CREATE POLICY "Users can manage own analytics" ON analytics_daily FOR ALL USING (agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()));
CREATE POLICY "Admin can manage all analytics" ON analytics_daily FOR ALL USING (is_admin());

-- ==================== SPECIAL_HOURS ====================
CREATE POLICY "Users can view own special_hours" ON special_hours FOR SELECT USING (store_id IN (SELECT s.id FROM stores s JOIN agents a ON s.agent_id = a.id WHERE a.user_id = auth.uid()));
CREATE POLICY "Users can manage own special_hours" ON special_hours FOR ALL USING (store_id IN (SELECT s.id FROM stores s JOIN agents a ON s.agent_id = a.id WHERE a.user_id = auth.uid()));
CREATE POLICY "Admin can manage all special_hours" ON special_hours FOR ALL USING (is_admin());

-- ==================== SPECIAL_EVENTS ====================
CREATE POLICY "Users can view own special_events" ON special_events FOR SELECT USING (store_id IN (SELECT s.id FROM stores s JOIN agents a ON s.agent_id = a.id WHERE a.user_id = auth.uid()));
CREATE POLICY "Users can manage own special_events" ON special_events FOR ALL USING (store_id IN (SELECT s.id FROM stores s JOIN agents a ON s.agent_id = a.id WHERE a.user_id = auth.uid()));
CREATE POLICY "Admin can manage all special_events" ON special_events FOR ALL USING (is_admin());

-- ==================== API_KEYS ====================
CREATE POLICY "Admin can manage api_keys" ON api_keys FOR ALL USING (is_admin());
CREATE POLICY "Service role can manage api_keys" ON api_keys FOR ALL USING (auth.role() = 'service_role');

-- ==================== API_USAGE ====================
CREATE POLICY "Users can view own api_usage" ON api_usage FOR SELECT USING (user_id = auth.uid() OR agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()));
CREATE POLICY "Admin can manage all api_usage" ON api_usage FOR ALL USING (is_admin());
CREATE POLICY "Service role can manage api_usage" ON api_usage FOR ALL USING (auth.role() = 'service_role');

-- ==================== SECURITY_PATTERNS ====================
CREATE POLICY "Admin can manage security_patterns" ON security_patterns FOR ALL USING (is_admin());
CREATE POLICY "Service role can read security_patterns" ON security_patterns FOR SELECT USING (auth.role() = 'service_role');

-- ==================== SECURITY_INCIDENTS ====================
CREATE POLICY "Users can view own incidents" ON security_incidents FOR SELECT USING (agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()));
CREATE POLICY "Admin can manage all incidents" ON security_incidents FOR ALL USING (is_admin());
CREATE POLICY "Service role can manage incidents" ON security_incidents FOR ALL USING (auth.role() = 'service_role');

-- ==================== UNANSWERED_QUESTIONS ====================
CREATE POLICY "Users can view own unanswered" ON unanswered_questions FOR SELECT USING (agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()));
CREATE POLICY "Users can manage own unanswered" ON unanswered_questions FOR ALL USING (agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()));
CREATE POLICY "Admin can manage all unanswered" ON unanswered_questions FOR ALL USING (is_admin());
CREATE POLICY "Service role can manage unanswered" ON unanswered_questions FOR ALL USING (auth.role() = 'service_role');

-- ==================== VERIFICATION_RESPONSES ====================
CREATE POLICY "Anyone can view active responses" ON verification_responses FOR SELECT USING (is_active = true);
CREATE POLICY "Admin can manage responses" ON verification_responses FOR ALL USING (is_admin());

-- ==================== SYSTEM_SETTINGS ====================
CREATE POLICY "Admin can manage settings" ON system_settings FOR ALL USING (is_admin());
CREATE POLICY "Service role can read settings" ON system_settings FOR SELECT USING (auth.role() = 'service_role');

-- ==================== SUPPORT_MESSAGES ====================
CREATE POLICY "Users can view own support" ON support_messages FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can insert support" ON support_messages FOR INSERT WITH CHECK (user_id = auth.uid() OR user_id IS NULL);
CREATE POLICY "Admin can manage all support" ON support_messages FOR ALL USING (is_admin());

-- ==================== TENANT_PERMISSIONS ====================
CREATE POLICY "Users can view own permissions" ON tenant_permissions FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Admin can manage all permissions" ON tenant_permissions FOR ALL USING (is_admin());

-- ==================== TENANT_QUOTAS ====================
CREATE POLICY "Users can view own quotas" ON tenant_quotas FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Admin can manage all quotas" ON tenant_quotas FOR ALL USING (is_admin());

;
