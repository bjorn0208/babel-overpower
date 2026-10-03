
-- ================================================================================
-- LIMPA NOME IA - ROW LEVEL SECURITY POLICIES
-- ================================================================================

-- Enable RLS on all tables
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
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- ========== PROFILES ==========
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT USING (id = auth.uid() OR is_admin());
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE USING (id = auth.uid() OR is_admin());
CREATE POLICY "profiles_insert_self" ON profiles FOR INSERT WITH CHECK (id = auth.uid());

-- ========== AGENTS ==========
CREATE POLICY "agents_select_own" ON agents FOR SELECT USING (user_id = auth.uid() OR is_admin());
CREATE POLICY "agents_insert_own" ON agents FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "agents_update_own" ON agents FOR UPDATE USING (user_id = auth.uid() OR is_admin());
CREATE POLICY "agents_delete_own" ON agents FOR DELETE USING (user_id = auth.uid() OR is_admin());

-- ========== STORES ==========
CREATE POLICY "stores_select" ON stores FOR SELECT USING (
  agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()) OR is_admin()
);
CREATE POLICY "stores_insert" ON stores FOR INSERT WITH CHECK (
  agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()) OR is_admin()
);
CREATE POLICY "stores_update" ON stores FOR UPDATE USING (
  agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()) OR is_admin()
);
CREATE POLICY "stores_delete" ON stores FOR DELETE USING (
  agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()) OR is_admin()
);

-- ========== CONVERSATIONS (service role + owner) ==========
CREATE POLICY "conversations_select" ON conversations FOR SELECT USING (
  agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()) OR is_admin()
);
CREATE POLICY "conversations_insert" ON conversations FOR INSERT WITH CHECK (true);
CREATE POLICY "conversations_update" ON conversations FOR UPDATE USING (
  agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()) OR is_admin()
);

-- ========== MESSAGES ==========
CREATE POLICY "messages_select" ON messages FOR SELECT USING (
  conversation_id IN (
    SELECT c.id FROM conversations c
    JOIN agents a ON c.agent_id = a.id
    WHERE a.user_id = auth.uid()
  ) OR is_admin()
);
CREATE POLICY "messages_insert" ON messages FOR INSERT WITH CHECK (true);

-- ========== KNOWLEDGE_ITEMS ==========
CREATE POLICY "knowledge_select" ON knowledge_items FOR SELECT USING (
  agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()) OR is_admin()
);
CREATE POLICY "knowledge_insert" ON knowledge_items FOR INSERT WITH CHECK (
  agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()) OR is_admin()
);
CREATE POLICY "knowledge_update" ON knowledge_items FOR UPDATE USING (
  agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()) OR is_admin()
);
CREATE POLICY "knowledge_delete" ON knowledge_items FOR DELETE USING (
  agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()) OR is_admin()
);

-- ========== QUICK_ACTIONS ==========
CREATE POLICY "quick_actions_select" ON quick_actions FOR SELECT USING (
  agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()) OR is_admin()
);
CREATE POLICY "quick_actions_manage" ON quick_actions FOR ALL USING (
  agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()) OR is_admin()
);

-- ========== CUSTOM_BUTTONS ==========
CREATE POLICY "custom_buttons_select" ON custom_buttons FOR SELECT USING (
  agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()) OR is_admin()
);
CREATE POLICY "custom_buttons_manage" ON custom_buttons FOR ALL USING (
  agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()) OR is_admin()
);

-- ========== SECURITY (admin-only write, public read for detection) ==========
CREATE POLICY "security_patterns_select" ON security_patterns FOR SELECT USING (true);
CREATE POLICY "security_patterns_manage" ON security_patterns FOR ALL USING (is_admin());
CREATE POLICY "security_incidents_select" ON security_incidents FOR SELECT USING (is_admin());
CREATE POLICY "security_incidents_insert" ON security_incidents FOR INSERT WITH CHECK (true);

-- ========== VERIFICATION_RESPONSES ==========
CREATE POLICY "verification_select" ON verification_responses FOR SELECT USING (true);
CREATE POLICY "verification_manage" ON verification_responses FOR ALL USING (is_admin());

-- ========== UNANSWERED_QUESTIONS ==========
CREATE POLICY "unanswered_select" ON unanswered_questions FOR SELECT USING (
  agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()) OR is_admin()
);
CREATE POLICY "unanswered_insert" ON unanswered_questions FOR INSERT WITH CHECK (true);
CREATE POLICY "unanswered_update" ON unanswered_questions FOR UPDATE USING (
  agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()) OR is_admin()
);

-- ========== API_KEYS (admin only) ==========
CREATE POLICY "api_keys_select" ON api_keys FOR SELECT USING (is_admin());
CREATE POLICY "api_keys_manage" ON api_keys FOR ALL USING (is_admin());

-- ========== API_USAGE ==========
CREATE POLICY "api_usage_select" ON api_usage FOR SELECT USING (user_id = auth.uid() OR is_admin());
CREATE POLICY "api_usage_insert" ON api_usage FOR INSERT WITH CHECK (true);

-- ========== PLANS (public read) ==========
CREATE POLICY "plans_select" ON plans FOR SELECT USING (true);
CREATE POLICY "plans_manage" ON plans FOR ALL USING (is_admin());

-- ========== SUBSCRIPTIONS ==========
CREATE POLICY "subscriptions_select" ON subscriptions FOR SELECT USING (user_id = auth.uid() OR is_admin());
CREATE POLICY "subscriptions_manage" ON subscriptions FOR ALL USING (is_admin());

-- ========== ANALYTICS ==========
CREATE POLICY "analytics_select" ON analytics_daily FOR SELECT USING (
  agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()) OR is_admin()
);
CREATE POLICY "analytics_insert" ON analytics_daily FOR INSERT WITH CHECK (true);

-- ========== TENANT_PERMISSIONS / QUOTAS ==========
CREATE POLICY "permissions_select" ON tenant_permissions FOR SELECT USING (user_id = auth.uid() OR is_admin());
CREATE POLICY "permissions_manage" ON tenant_permissions FOR ALL USING (is_admin());
CREATE POLICY "quotas_select" ON tenant_quotas FOR SELECT USING (user_id = auth.uid() OR is_admin());
CREATE POLICY "quotas_manage" ON tenant_quotas FOR ALL USING (is_admin());

-- ========== SYSTEM_SETTINGS ==========
CREATE POLICY "settings_select" ON system_settings FOR SELECT USING (true);
CREATE POLICY "settings_manage" ON system_settings FOR ALL USING (is_admin());

-- ========== SPECIAL_HOURS / EVENTS ==========
CREATE POLICY "special_hours_select" ON special_hours FOR SELECT USING (true);
CREATE POLICY "special_hours_manage" ON special_hours FOR ALL USING (is_admin());
CREATE POLICY "special_events_select" ON special_events FOR SELECT USING (true);
CREATE POLICY "special_events_manage" ON special_events FOR ALL USING (is_admin());

-- ========== SUPPORT ==========
CREATE POLICY "support_select" ON support_messages FOR SELECT USING (user_id = auth.uid() OR is_admin());
CREATE POLICY "support_insert" ON support_messages FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "support_update" ON support_messages FOR UPDATE USING (is_admin());

-- ========== CRM: LEADS ==========
CREATE POLICY "leads_select" ON leads FOR SELECT USING (
  agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()) OR is_admin()
);
CREATE POLICY "leads_insert" ON leads FOR INSERT WITH CHECK (true);
CREATE POLICY "leads_update" ON leads FOR UPDATE USING (
  agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()) OR is_admin()
);
CREATE POLICY "leads_delete" ON leads FOR DELETE USING (is_admin());

-- ========== CRM: CLIENTS ==========
CREATE POLICY "clients_select" ON clients FOR SELECT USING (
  agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()) OR is_admin()
);
CREATE POLICY "clients_insert" ON clients FOR INSERT WITH CHECK (
  agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()) OR is_admin()
);
CREATE POLICY "clients_update" ON clients FOR UPDATE USING (
  agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()) OR is_admin()
);

-- ========== CRM: CONTRACTS ==========
CREATE POLICY "contracts_select" ON contracts FOR SELECT USING (
  agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()) OR is_admin()
);
CREATE POLICY "contracts_manage" ON contracts FOR ALL USING (
  agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()) OR is_admin()
);

-- ========== CRM: PAYMENTS ==========
CREATE POLICY "payments_select" ON payments FOR SELECT USING (
  client_id IN (SELECT id FROM clients WHERE agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()))
  OR is_admin()
);
CREATE POLICY "payments_insert" ON payments FOR INSERT WITH CHECK (true);
CREATE POLICY "payments_update" ON payments FOR UPDATE USING (is_admin());

-- ========== CRM: TASKS ==========
CREATE POLICY "tasks_select" ON tasks FOR SELECT USING (
  agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()) OR is_admin()
);
CREATE POLICY "tasks_manage" ON tasks FOR ALL USING (
  agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()) OR is_admin()
);

-- ========== CRM: ACTIVITIES ==========
CREATE POLICY "activities_select" ON activities FOR SELECT USING (
  agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()) OR is_admin()
);
CREATE POLICY "activities_insert" ON activities FOR INSERT WITH CHECK (true);

-- ========== CRM: DOCUMENTS ==========
CREATE POLICY "documents_select" ON documents FOR SELECT USING (
  client_id IN (SELECT id FROM clients WHERE agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()))
  OR is_admin()
);
CREATE POLICY "documents_manage" ON documents FOR ALL USING (
  client_id IN (SELECT id FROM clients WHERE agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()))
  OR is_admin()
);

;
