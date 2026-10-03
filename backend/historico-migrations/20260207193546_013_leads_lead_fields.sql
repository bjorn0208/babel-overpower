
-- ============================================================
-- 013 LEADS + LEAD_FIELDS
-- ============================================================

CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  agent_id UUID NOT NULL REFERENCES agents(id),
  external_channel TEXT NOT NULL DEFAULT 'webchat',
  external_id TEXT NOT NULL,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  current_flow_id UUID REFERENCES flows(id),
  current_block_id UUID REFERENCES blocks(id),
  block_state JSONB DEFAULT '{}',
  handler_type TEXT NOT NULL DEFAULT 'engine',
  handler_profile_id UUID REFERENCES profiles(id),
  flow_paused BOOLEAN NOT NULL DEFAULT false,
  flow_pause_reason TEXT,
  temperature TEXT DEFAULT 'cold',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_leads_agent_channel_external
  ON leads (agent_id, external_channel, external_id);
CREATE INDEX idx_leads_tenant ON leads (tenant_id);
CREATE INDEX idx_leads_agent ON leads (agent_id);
CREATE INDEX idx_leads_status ON leads (status);
CREATE INDEX idx_leads_flow ON leads (current_flow_id);

CREATE TRIGGER trg_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leads_select"
  ON leads FOR SELECT
  USING (tenant_id = get_user_tenant_id() OR is_platform_admin());

CREATE POLICY "leads_manage"
  ON leads FOR ALL
  USING (
    (tenant_id = get_user_tenant_id() AND has_permission('leads.manage'))
    OR is_platform_admin()
  );

-- LEAD_FIELDS
CREATE TABLE lead_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  field_name TEXT NOT NULL,
  field_value TEXT NOT NULL,
  capture_type TEXT NOT NULL,
  gate_1_passed BOOLEAN NOT NULL DEFAULT false,
  gate_2_passed BOOLEAN NOT NULL DEFAULT false,
  gate_3_passed BOOLEAN NOT NULL DEFAULT false,
  is_locked BOOLEAN NOT NULL DEFAULT true,
  locked_at TIMESTAMPTZ DEFAULT now(),
  unlocked_at TIMESTAMPTZ,
  unlocked_by UUID REFERENCES profiles(id),
  block_id UUID REFERENCES blocks(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_lead_fields_unique
  ON lead_fields (lead_id, field_name);
CREATE INDEX idx_lead_fields_tenant ON lead_fields (tenant_id);
CREATE INDEX idx_lead_fields_lead ON lead_fields (lead_id);

CREATE TRIGGER trg_lead_fields_updated_at
  BEFORE UPDATE ON lead_fields
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE lead_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_fields_select"
  ON lead_fields FOR SELECT
  USING (tenant_id = get_user_tenant_id() OR is_platform_admin());

CREATE POLICY "lead_fields_manage"
  ON lead_fields FOR ALL
  USING (
    (tenant_id = get_user_tenant_id() AND has_permission('leads.manage'))
    OR is_platform_admin()
  );

;
