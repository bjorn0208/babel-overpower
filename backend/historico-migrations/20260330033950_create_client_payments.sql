-- Tabela de pagamentos por cliente
CREATE TABLE IF NOT EXISTS client_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  contract_id uuid REFERENCES contracts(id) ON DELETE SET NULL,
  descricao text NOT NULL DEFAULT '',
  valor numeric NOT NULL DEFAULT 0,
  data_vencimento date NOT NULL,
  data_pagamento date,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'pago', 'cancelado')),
  metodo_pagamento text,
  observacao text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes (FK + query filters)
CREATE INDEX IF NOT EXISTS idx_client_payments_tenant_id ON client_payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_client_payments_lead_id ON client_payments(lead_id);
CREATE INDEX IF NOT EXISTS idx_client_payments_contract_id ON client_payments(contract_id);
CREATE INDEX IF NOT EXISTS idx_client_payments_vencimento ON client_payments(data_vencimento);
CREATE INDEX IF NOT EXISTS idx_client_payments_status ON client_payments(status);

-- RLS
ALTER TABLE client_payments ENABLE ROW LEVEL SECURITY;

-- Service role bypass
DROP POLICY IF EXISTS srv_client_payments ON client_payments;
CREATE POLICY srv_client_payments ON client_payments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated SELECT
DROP POLICY IF EXISTS user_read_own_payments ON client_payments;
CREATE POLICY user_read_own_payments ON client_payments
  FOR SELECT TO authenticated USING (
    tenant_id = (SELECT auth.uid())
    OR tenant_id IN (
      SELECT profiles.parent_user_id FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.parent_user_id IS NOT NULL
    )
    OR is_platform_admin()
  );

-- Authenticated INSERT
DROP POLICY IF EXISTS user_insert_own_payments ON client_payments;
CREATE POLICY user_insert_own_payments ON client_payments
  FOR INSERT TO authenticated WITH CHECK (
    tenant_id = (SELECT auth.uid())
    OR tenant_id IN (
      SELECT profiles.parent_user_id FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.parent_user_id IS NOT NULL
    )
    OR is_platform_admin()
  );

-- Authenticated UPDATE
DROP POLICY IF EXISTS user_update_own_payments ON client_payments;
CREATE POLICY user_update_own_payments ON client_payments
  FOR UPDATE TO authenticated USING (
    tenant_id = (SELECT auth.uid())
    OR tenant_id IN (
      SELECT profiles.parent_user_id FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.parent_user_id IS NOT NULL
    )
    OR is_platform_admin()
  );

-- Authenticated DELETE
DROP POLICY IF EXISTS user_delete_own_payments ON client_payments;
CREATE POLICY user_delete_own_payments ON client_payments
  FOR DELETE TO authenticated USING (
    tenant_id = (SELECT auth.uid())
    OR tenant_id IN (
      SELECT profiles.parent_user_id FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.parent_user_id IS NOT NULL
    )
    OR is_platform_admin()
  );
;
