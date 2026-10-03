
-- ============================================================
-- 016 CREDITS
-- ============================================================

CREATE TABLE credit_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID UNIQUE NOT NULL REFERENCES tenants(id),
  balance DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  total_purchased DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_consumed DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_bonus DECIMAL(12,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE credit_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wallets_select"
  ON credit_wallets FOR SELECT
  USING (tenant_id = get_user_tenant_id() OR is_platform_admin());

CREATE POLICY "wallets_manage"
  ON credit_wallets FOR ALL
  USING (is_platform_admin());

-- CREDIT_TRANSACTIONS
CREATE TABLE credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  wallet_id UUID NOT NULL REFERENCES credit_wallets(id),
  type TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  balance_after DECIMAL(12,2) NOT NULL,
  description TEXT,
  reference_type TEXT,
  reference_id UUID,
  llm_model_id UUID REFERENCES llm_models(id),
  token_input INTEGER,
  token_output INTEGER,
  cost_usd DECIMAL(10,6),
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_credit_tx_tenant ON credit_transactions (tenant_id);
CREATE INDEX idx_credit_tx_wallet ON credit_transactions (wallet_id);
CREATE INDEX idx_credit_tx_type ON credit_transactions (type);
CREATE INDEX idx_credit_tx_created ON credit_transactions (created_at);

ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "credit_tx_select"
  ON credit_transactions FOR SELECT
  USING (tenant_id = get_user_tenant_id() OR is_platform_admin());

CREATE POLICY "credit_tx_insert"
  ON credit_transactions FOR INSERT
  WITH CHECK (true);

-- CREDIT_PACKAGES
CREATE TABLE credit_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  credit_amount DECIMAL(12,2) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BRL',
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO credit_packages (name, description, credit_amount, price, sort_order) VALUES
  ('Basico', '1.000 creditos', 1000, 29.90, 1),
  ('Popular', '5.000 creditos (+500 bonus)', 5500, 99.90, 2),
  ('Profissional', '15.000 creditos (+3.000 bonus)', 18000, 249.90, 3),
  ('Empresarial', '50.000 creditos (+15.000 bonus)', 65000, 699.90, 4);

-- FUNCAO: Debitar creditos
CREATE OR REPLACE FUNCTION debit_credits(
  _tenant_id UUID,
  _llm_model_id UUID,
  _tokens_input INTEGER,
  _tokens_output INTEGER,
  _message_id UUID DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  credits_debited INTEGER,
  balance_remaining DECIMAL(12,2),
  cost_usd DECIMAL(10,6),
  error_message TEXT
) AS $$
DECLARE
  _wallet RECORD;
  _calc RECORD;
  _is_unlimited BOOLEAN;
  _new_balance DECIMAL(12,2);
BEGIN
  _is_unlimited := is_tenant_unlimited(_tenant_id);
  SELECT * INTO _calc FROM calculate_credits(_llm_model_id, _tokens_input, _tokens_output);
  SELECT * INTO _wallet FROM credit_wallets WHERE tenant_id = _tenant_id FOR UPDATE;

  IF _wallet IS NULL THEN
    success := false;
    error_message := 'Carteira nao encontrada';
    RETURN NEXT;
    RETURN;
  END IF;

  IF _is_unlimited THEN
    INSERT INTO credit_transactions (
      tenant_id, wallet_id, type, amount, balance_after,
      description, reference_type, reference_id,
      llm_model_id, token_input, token_output, cost_usd
    ) VALUES (
      _tenant_id, _wallet.id, 'consumption', 0, _wallet.balance,
      'Uso ilimitado (nao debitado)',
      'message', _message_id,
      _llm_model_id, _tokens_input, _tokens_output, _calc.cost_usd_total
    );

    success := true;
    credits_debited := 0;
    balance_remaining := _wallet.balance;
    cost_usd := _calc.cost_usd_total;
    RETURN NEXT;
    RETURN;
  END IF;

  IF _wallet.balance < _calc.credits_total THEN
    success := false;
    credits_debited := 0;
    balance_remaining := _wallet.balance;
    cost_usd := _calc.cost_usd_total;
    error_message := 'Creditos insuficientes. Saldo: ' || _wallet.balance || ', necessario: ' || _calc.credits_total;
    RETURN NEXT;
    RETURN;
  END IF;

  _new_balance := _wallet.balance - _calc.credits_total;

  UPDATE credit_wallets
  SET balance = _new_balance,
      total_consumed = total_consumed + _calc.credits_total,
      updated_at = now()
  WHERE id = _wallet.id;

  INSERT INTO credit_transactions (
    tenant_id, wallet_id, type, amount, balance_after,
    description, reference_type, reference_id,
    llm_model_id, token_input, token_output, cost_usd
  ) VALUES (
    _tenant_id, _wallet.id, 'consumption', -_calc.credits_total, _new_balance,
    'Consumo LLM: ' || _tokens_input || ' input + ' || _tokens_output || ' output tokens',
    'message', _message_id,
    _llm_model_id, _tokens_input, _tokens_output, _calc.cost_usd_total
  );

  success := true;
  credits_debited := _calc.credits_total;
  balance_remaining := _new_balance;
  cost_usd := _calc.cost_usd_total;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- FUNCAO: Adicionar creditos
CREATE OR REPLACE FUNCTION add_credits(
  _tenant_id UUID,
  _amount DECIMAL(12,2),
  _type TEXT DEFAULT 'adjustment',
  _description TEXT DEFAULT 'Ajuste manual',
  _admin_id UUID DEFAULT NULL
)
RETURNS DECIMAL(12,2) AS $$
DECLARE
  _wallet RECORD;
  _new_balance DECIMAL(12,2);
BEGIN
  SELECT * INTO _wallet FROM credit_wallets WHERE tenant_id = _tenant_id FOR UPDATE;

  _new_balance := _wallet.balance + _amount;

  UPDATE credit_wallets
  SET balance = _new_balance,
      total_purchased = CASE WHEN _type IN ('purchase', 'bonus') THEN total_purchased + _amount ELSE total_purchased END,
      total_bonus = CASE WHEN _type = 'bonus' THEN total_bonus + _amount ELSE total_bonus END,
      updated_at = now()
  WHERE id = _wallet.id;

  INSERT INTO credit_transactions (
    tenant_id, wallet_id, type, amount, balance_after,
    description, created_by
  ) VALUES (
    _tenant_id, _wallet.id, _type, _amount, _new_balance,
    _description, _admin_id
  );

  RETURN _new_balance;
END;
$$ LANGUAGE plpgsql;

;
