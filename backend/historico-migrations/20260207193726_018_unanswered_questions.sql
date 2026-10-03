
-- ============================================================
-- 018 UNANSWERED_QUESTIONS
-- ============================================================

CREATE TABLE unanswered_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  agent_id UUID NOT NULL REFERENCES agents(id),
  conversation_id UUID REFERENCES conversations(id),
  lead_id UUID REFERENCES leads(id),
  question TEXT NOT NULL,
  detection_reason TEXT,
  suggested_answer TEXT,
  is_resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_by UUID REFERENCES profiles(id),
  resolved_at TIMESTAMPTZ,
  knowledge_item_id UUID REFERENCES knowledge_items(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_unanswered_tenant ON unanswered_questions (tenant_id);
CREATE INDEX idx_unanswered_agent ON unanswered_questions (agent_id);
CREATE INDEX idx_unanswered_resolved ON unanswered_questions (is_resolved);

ALTER TABLE unanswered_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "unanswered_select"
  ON unanswered_questions FOR SELECT
  USING (tenant_id = get_user_tenant_id() OR is_platform_admin());

CREATE POLICY "unanswered_insert"
  ON unanswered_questions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "unanswered_update"
  ON unanswered_questions FOR UPDATE
  USING (
    (tenant_id = get_user_tenant_id() AND has_permission('knowledge.edit'))
    OR is_platform_admin()
  );

;
