
-- CRM stage mapping (bidirectional flow <-> pipeline sync)
CREATE TABLE IF NOT EXISTS flow_stage_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  flow_id UUID NOT NULL REFERENCES flows(id),
  block_id UUID NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
  pipeline_stage TEXT NOT NULL,
  is_entry_block BOOLEAN DEFAULT false,
  is_exit_block BOOLEAN DEFAULT false,
  exit_criteria JSONB DEFAULT '{}',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(flow_id, block_id)
);

CREATE INDEX idx_fsm_flow ON flow_stage_mapping(flow_id);
CREATE INDEX idx_fsm_stage ON flow_stage_mapping(pipeline_stage);

ALTER TABLE flow_stage_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fsm_select" ON flow_stage_mapping FOR SELECT
  USING (tenant_id = get_user_tenant_id() OR is_platform_admin());
CREATE POLICY "fsm_insert" ON flow_stage_mapping FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id());
CREATE POLICY "fsm_update" ON flow_stage_mapping FOR UPDATE
  USING (tenant_id = get_user_tenant_id() OR is_platform_admin());
CREATE POLICY "fsm_delete" ON flow_stage_mapping FOR DELETE
  USING (tenant_id = get_user_tenant_id() OR is_platform_admin());

;
