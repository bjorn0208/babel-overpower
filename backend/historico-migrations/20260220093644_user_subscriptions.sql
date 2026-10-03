
-- Assinatura do usuario (vincula usuario a um plano)
CREATE TABLE user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plano_id UUID REFERENCES store_planos(id) ON DELETE SET NULL,
  plano_nome TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled', 'suspended')),
  max_conversas INTEGER NOT NULL DEFAULT 1000,
  conversas_usadas INTEGER NOT NULL DEFAULT 0,
  max_ciclos_por_conversa INTEGER NOT NULL DEFAULT 30,
  data_inicio TIMESTAMPTZ NOT NULL DEFAULT now(),
  data_expiracao TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  preco NUMERIC(10,2) NOT NULL DEFAULT 0,
  observacao TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_subs" ON user_subscriptions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "admin_all_subs" ON user_subscriptions FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role = 'platform_admin'));
CREATE POLICY "user_read_own_sub" ON user_subscriptions FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_subscription_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_subscription_updated_at
  BEFORE UPDATE ON user_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_subscription_updated_at();

;
