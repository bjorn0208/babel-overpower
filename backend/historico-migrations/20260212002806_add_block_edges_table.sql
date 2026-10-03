
-- Block edges (visual connections between nodes on canvas)
CREATE TABLE IF NOT EXISTS block_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  flow_id UUID NOT NULL REFERENCES flows(id),
  source_block_id UUID NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
  target_block_id UUID NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
  source_handle TEXT DEFAULT 'default',
  target_handle TEXT DEFAULT 'default',
  label TEXT,
  edge_type TEXT DEFAULT 'smoothstep',
  style JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_edges_flow ON block_edges(flow_id);
CREATE INDEX idx_edges_source ON block_edges(source_block_id);
CREATE INDEX idx_edges_target ON block_edges(target_block_id);

ALTER TABLE block_edges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "edges_select" ON block_edges FOR SELECT
  USING (tenant_id = get_user_tenant_id() OR is_platform_admin());
CREATE POLICY "edges_insert" ON block_edges FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id() AND has_permission('flows.edit'));
CREATE POLICY "edges_update" ON block_edges FOR UPDATE
  USING ((tenant_id = get_user_tenant_id() AND has_permission('flows.edit')) OR is_platform_admin());
CREATE POLICY "edges_delete" ON block_edges FOR DELETE
  USING ((tenant_id = get_user_tenant_id() AND has_permission('flows.edit')) OR is_platform_admin());

;
