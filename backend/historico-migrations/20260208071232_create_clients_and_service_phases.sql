
-- ============================================
-- service_phases: fases customizáveis por tenant
-- ============================================
CREATE TABLE service_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#8B5CF6',
  icon TEXT NOT NULL DEFAULT 'circle',
  position INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE service_phases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_service_phases" ON service_phases
  FOR ALL USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE INDEX idx_service_phases_tenant ON service_phases(tenant_id);

-- ============================================
-- clients: clientes com tracking de fases
-- ============================================
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  lead_id UUID REFERENCES leads(id),
  display_name TEXT,
  email TEXT,
  phone TEXT,
  cpf TEXT,
  current_phase_id UUID REFERENCES service_phases(id),
  tracking_token VARCHAR(8) UNIQUE,
  contract_value DECIMAL(12,2),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_clients" ON clients
  FOR ALL USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE INDEX idx_clients_tenant ON clients(tenant_id);
CREATE INDEX idx_clients_tracking_token ON clients(tracking_token);
CREATE INDEX idx_clients_status ON clients(tenant_id, status);

-- ============================================
-- Inserir fases padrão para tenants existentes
-- ============================================
INSERT INTO service_phases (tenant_id, name, description, color, icon, position)
SELECT t.id, fase.name, fase.description, fase.color, fase.icon, fase.position
FROM tenants t
CROSS JOIN (VALUES
  ('Contrato', 'Contrato assinado e confirmado', '#3B82F6', 'document', 0),
  ('Documentacao', 'Documentos recebidos e em analise', '#EAB308', 'folder', 1),
  ('Protocolando', 'Protocolo junto aos orgaos de protecao', '#8B5CF6', 'shield', 2),
  ('Em Andamento', 'Em analise, aguardando finalizacao', '#F97316', 'clock', 3),
  ('Concluido', 'Processo finalizado com sucesso', '#22C55E', 'check', 4)
) AS fase(name, description, color, icon, position)
WHERE t.is_platform = false;

;
