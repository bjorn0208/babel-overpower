
-- ====================================
-- FASE 1: Colunas novas em profiles
-- ====================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS multinivel_ativo boolean DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS saldo_multinivel numeric DEFAULT 0;

-- ====================================
-- FASE 2: Tabela multinivel_niveis
-- ====================================
CREATE TABLE IF NOT EXISTS multinivel_niveis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nivel int NOT NULL UNIQUE,
  percentual numeric NOT NULL DEFAULT 0,
  descricao text DEFAULT '',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE multinivel_niveis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin pode tudo em multinivel_niveis"
  ON multinivel_niveis FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role = 'platform_admin')
  );

CREATE POLICY "Users podem ler multinivel_niveis ativos"
  ON multinivel_niveis FOR SELECT
  USING (is_active = true);

-- ====================================
-- FASE 3: Tabela multinivel_comissoes
-- ====================================
CREATE TABLE IF NOT EXISTS multinivel_comissoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beneficiario_id uuid NOT NULL REFERENCES profiles(id),
  origem_id uuid NOT NULL REFERENCES profiles(id),
  purchase_order_id uuid NOT NULL REFERENCES purchase_orders(id),
  nivel int NOT NULL,
  percentual numeric NOT NULL,
  valor_base numeric NOT NULL,
  valor_comissao numeric NOT NULL,
  status text NOT NULL DEFAULT 'creditado' CHECK (status IN ('pendente', 'creditado', 'pago')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE multinivel_comissoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin pode tudo em multinivel_comissoes"
  ON multinivel_comissoes FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role = 'platform_admin')
  );

CREATE POLICY "User ve proprias comissoes"
  ON multinivel_comissoes FOR SELECT
  USING (beneficiario_id = auth.uid());

CREATE INDEX idx_comissoes_beneficiario ON multinivel_comissoes(beneficiario_id);
CREATE INDEX idx_comissoes_origem ON multinivel_comissoes(origem_id);
CREATE INDEX idx_comissoes_order ON multinivel_comissoes(purchase_order_id);

-- ====================================
-- FASE 4: Tabela multinivel_saques
-- ====================================
CREATE TABLE IF NOT EXISTS multinivel_saques (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id),
  valor numeric NOT NULL CHECK (valor > 0),
  metodo text DEFAULT 'pix',
  chave_pix text DEFAULT '',
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovado', 'pago', 'recusado')),
  comprovante_url text,
  observacao text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE multinivel_saques ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin pode tudo em multinivel_saques"
  ON multinivel_saques FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role = 'platform_admin')
  );

CREATE POLICY "User ve proprios saques"
  ON multinivel_saques FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "User pode criar saque"
  ON multinivel_saques FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_saques_user ON multinivel_saques(user_id);

-- ====================================
-- FASE 5: Function de comissao em cascata
-- ====================================
CREATE OR REPLACE FUNCTION processar_comissao_multinivel()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id uuid;
  v_valor numeric;
  v_current_id uuid;
  v_nivel int := 0;
  v_max_nivel int;
  v_percentual numeric;
  v_comissao numeric;
  v_is_ativo boolean;
BEGIN
  -- So processa quando status muda pra aprovado
  IF NEW.status != 'aprovado' THEN RETURN NEW; END IF;
  IF OLD.status = 'aprovado' THEN RETURN NEW; END IF;

  v_user_id := NEW.user_id;
  v_valor := NEW.item_preco;

  -- Buscar quem indicou o comprador
  SELECT referred_by INTO v_current_id FROM profiles WHERE id = v_user_id;

  -- Buscar max nivel configurado
  SELECT MAX(nivel) INTO v_max_nivel FROM multinivel_niveis WHERE is_active = true;

  -- Se nao tem niveis configurados ou nao tem indicador, sai
  IF v_max_nivel IS NULL OR v_current_id IS NULL THEN
    RETURN NEW;
  END IF;

  WHILE v_current_id IS NOT NULL AND v_nivel < v_max_nivel LOOP
    v_nivel := v_nivel + 1;

    -- Verificar se o beneficiario tem multinivel ativo
    SELECT multinivel_ativo INTO v_is_ativo FROM profiles WHERE id = v_current_id;

    IF v_is_ativo IS NOT TRUE THEN
      -- Pular esse nivel mas continuar subindo
      SELECT referred_by INTO v_current_id FROM profiles WHERE id = v_current_id;
      CONTINUE;
    END IF;

    -- Buscar percentual do nivel
    SELECT percentual INTO v_percentual FROM multinivel_niveis WHERE nivel = v_nivel AND is_active = true;
    IF v_percentual IS NULL THEN EXIT; END IF;

    v_comissao := ROUND(v_valor * v_percentual / 100, 2);

    IF v_comissao > 0 THEN
      -- Registrar comissao
      INSERT INTO multinivel_comissoes (beneficiario_id, origem_id, purchase_order_id, nivel, percentual, valor_base, valor_comissao, status)
      VALUES (v_current_id, v_user_id, NEW.id, v_nivel, v_percentual, v_valor, v_comissao, 'creditado');

      -- Atualizar saldo
      UPDATE profiles SET saldo_multinivel = COALESCE(saldo_multinivel, 0) + v_comissao WHERE id = v_current_id;
    END IF;

    -- Subir pro proximo nivel
    SELECT referred_by INTO v_current_id FROM profiles WHERE id = v_current_id;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger na purchase_orders
DROP TRIGGER IF EXISTS trg_comissao_multinivel ON purchase_orders;
CREATE TRIGGER trg_comissao_multinivel
  AFTER UPDATE ON purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION processar_comissao_multinivel();

-- Tambem rodar quando inserir ja aprovado (caso raro)
DROP TRIGGER IF EXISTS trg_comissao_multinivel_insert ON purchase_orders;
CREATE TRIGGER trg_comissao_multinivel_insert
  AFTER INSERT ON purchase_orders
  FOR EACH ROW
  WHEN (NEW.status = 'aprovado')
  EXECUTE FUNCTION processar_comissao_multinivel();

;
