
-- Contracts with digital signature (Brazilian law compliant)
CREATE TABLE IF NOT EXISTS contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  lead_id UUID NOT NULL REFERENCES leads(id),
  agent_id UUID NOT NULL REFERENCES agents(id),
  conversation_id UUID REFERENCES conversations(id),
  template_html TEXT NOT NULL,
  rendered_html TEXT NOT NULL,
  pdf_storage_path TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  acceptance_keyword TEXT DEFAULT 'ACEITO',
  accepted_at TIMESTAMPTZ,
  accepted_via TEXT,
  lead_ip TEXT,
  acceptance_hash TEXT,
  legal_basis TEXT DEFAULT 'MP 2.200-2/2001 art.10 §2 e Lei 14.063/2020',
  variables_snapshot JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_contracts_lead ON contracts(lead_id);
CREATE INDEX idx_contracts_tenant ON contracts(tenant_id);

ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contracts_select" ON contracts FOR SELECT
  USING (tenant_id = get_user_tenant_id() OR is_platform_admin());
CREATE POLICY "contracts_insert" ON contracts FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id());
CREATE POLICY "contracts_update" ON contracts FOR UPDATE
  USING (tenant_id = get_user_tenant_id() OR is_platform_admin());

CREATE TRIGGER trg_contracts_updated_at
  BEFORE UPDATE ON contracts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

;
