
-- ============================================================
-- 008 PLANS + SUBSCRIPTIONS
-- ============================================================

CREATE TABLE plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  price_monthly DECIMAL(10,2) NOT NULL DEFAULT 0,
  billing_type TEXT NOT NULL DEFAULT 'credits',
  included_credits INTEGER DEFAULT 0,
  max_agents INTEGER NOT NULL DEFAULT 1,
  max_team_members INTEGER NOT NULL DEFAULT 2,
  max_knowledge_items INTEGER NOT NULL DEFAULT 100,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE plans IS 'Planos da plataforma. billing_type define se cobra por creditos ou ilimitado.';

CREATE TRIGGER trg_plans_updated_at
  BEFORE UPDATE ON plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

INSERT INTO plans (name, description, price_monthly, billing_type, included_credits, max_agents, max_team_members, max_knowledge_items, sort_order) VALUES
  ('Starter', 'Para comecar', 97.00, 'credits', 1000, 1, 2, 100, 1),
  ('Pro', 'Para crescer', 197.00, 'credits', 5000, 3, 5, 300, 2),
  ('Unlimited', 'Mensagens ilimitadas', 497.00, 'unlimited', 0, 5, 10, 500, 3),
  ('Enterprise', 'Sob medida', 997.00, 'unlimited', 0, -1, -1, -1, 4);

CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  plan_id UUID NOT NULL REFERENCES plans(id),
  status TEXT NOT NULL DEFAULT 'active',
  billing_type TEXT NOT NULL DEFAULT 'credits',
  activated_by UUID REFERENCES profiles(id),
  activation_mode TEXT NOT NULL DEFAULT 'manual',
  override_unlimited BOOLEAN NOT NULL DEFAULT false,
  admin_notes TEXT,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE subscriptions IS 'Assinatura ativa do tenant. override_unlimited forca ilimitado independente do plano.';

CREATE INDEX idx_subscriptions_tenant ON subscriptions (tenant_id);
CREATE INDEX idx_subscriptions_status ON subscriptions (status);

CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subscriptions_select"
  ON subscriptions FOR SELECT
  USING (tenant_id = get_user_tenant_id() OR is_platform_admin());

CREATE POLICY "subscriptions_manage"
  ON subscriptions FOR ALL
  USING (is_platform_admin());

CREATE OR REPLACE FUNCTION is_tenant_unlimited(_tenant_id UUID)
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT s.override_unlimited OR s.billing_type = 'unlimited'
     FROM subscriptions s
     WHERE s.tenant_id = _tenant_id
       AND s.status = 'active'
     ORDER BY s.created_at DESC
     LIMIT 1),
    false
  )
$$ LANGUAGE sql STABLE;

;
