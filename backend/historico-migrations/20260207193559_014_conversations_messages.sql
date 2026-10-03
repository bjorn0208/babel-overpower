
-- ============================================================
-- 014 CONVERSATIONS + MESSAGES
-- ============================================================

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  agent_id UUID NOT NULL REFERENCES agents(id),
  lead_id UUID NOT NULL REFERENCES leads(id),
  status TEXT NOT NULL DEFAULT 'active',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  message_count INTEGER NOT NULL DEFAULT 0,
  unanswered_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_conversations_tenant ON conversations (tenant_id);
CREATE INDEX idx_conversations_agent ON conversations (agent_id);
CREATE INDEX idx_conversations_lead ON conversations (lead_id);
CREATE INDEX idx_conversations_status ON conversations (status);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conversations_select"
  ON conversations FOR SELECT
  USING (tenant_id = get_user_tenant_id() OR is_platform_admin());

CREATE POLICY "conversations_manage"
  ON conversations FOR ALL
  USING (
    (tenant_id = get_user_tenant_id() AND has_permission('conversations.view'))
    OR is_platform_admin()
  );

-- MESSAGES
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  actor_id UUID REFERENCES profiles(id),
  block_id UUID REFERENCES blocks(id),
  llm_model_id UUID REFERENCES llm_models(id),
  token_input INTEGER DEFAULT 0,
  token_output INTEGER DEFAULT 0,
  credits_consumed INTEGER DEFAULT 0,
  cost_usd DECIMAL(10,6) DEFAULT 0,
  is_unanswered BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_conversation ON messages (conversation_id);
CREATE INDEX idx_messages_tenant ON messages (tenant_id);
CREATE INDEX idx_messages_created ON messages (created_at);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "messages_select"
  ON messages FOR SELECT
  USING (tenant_id = get_user_tenant_id() OR is_platform_admin());

CREATE POLICY "messages_insert"
  ON messages FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id() OR is_platform_admin());

-- TRIGGER: Atualiza contadores
CREATE OR REPLACE FUNCTION update_conversation_counts()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations SET
    message_count = message_count + 1,
    unanswered_count = CASE WHEN NEW.is_unanswered THEN unanswered_count + 1 ELSE unanswered_count END
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_message_count
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION update_conversation_counts();

;
