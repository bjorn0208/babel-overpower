
-- ============================================================
-- 010 AGENTS
-- ============================================================

CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  llm_model_id UUID NOT NULL REFERENCES llm_models(id),
  system_prompt TEXT,
  personality TEXT,
  temperature DECIMAL(2,1) NOT NULL DEFAULT 0.3,
  max_response_tokens INTEGER NOT NULL DEFAULT 500,
  status TEXT NOT NULL DEFAULT 'draft',
  welcome_message TEXT,
  fallback_message TEXT DEFAULT 'Desculpe, nao entendi. Pode reformular?',
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'
);

CREATE UNIQUE INDEX idx_agents_tenant_slug ON agents (tenant_id, slug);
CREATE INDEX idx_agents_tenant ON agents (tenant_id);
CREATE INDEX idx_agents_status ON agents (status);

CREATE TRIGGER trg_agents_updated_at
  BEFORE UPDATE ON agents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agents_select"
  ON agents FOR SELECT
  USING (tenant_id = get_user_tenant_id() OR is_platform_admin());

CREATE POLICY "agents_insert"
  ON agents FOR INSERT
  WITH CHECK (
    tenant_id = get_user_tenant_id()
    AND has_permission('agents.create')
  );

CREATE POLICY "agents_update"
  ON agents FOR UPDATE
  USING (
    (tenant_id = get_user_tenant_id() AND has_permission('agents.edit'))
    OR is_platform_admin()
  );

CREATE POLICY "agents_delete"
  ON agents FOR DELETE
  USING (
    (tenant_id = get_user_tenant_id() AND has_permission('agents.delete'))
    OR is_platform_admin()
  );

;
