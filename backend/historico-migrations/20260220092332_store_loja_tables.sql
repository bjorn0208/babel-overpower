
-- Implantacao (taxa de acesso a plataforma)
CREATE TABLE store_implantacao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  descricao TEXT DEFAULT '',
  preco NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Planos de assinatura
CREATE TABLE store_planos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  descricao TEXT DEFAULT '',
  preco_mensal NUMERIC(10,2) NOT NULL DEFAULT 0,
  modelo_llm_id UUID REFERENCES llm_models(id) ON DELETE SET NULL,
  max_conversas INTEGER NOT NULL DEFAULT 1000,
  max_ciclos_por_conversa INTEGER NOT NULL DEFAULT 30,
  dias_expiracao INTEGER NOT NULL DEFAULT 30,
  is_active BOOLEAN DEFAULT TRUE,
  ordem INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Pacotes extras de conversa
CREATE TABLE store_pacotes_extra (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plano_id UUID REFERENCES store_planos(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  descricao TEXT DEFAULT '',
  conversas INTEGER NOT NULL DEFAULT 500,
  preco NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Plus (Socio Comercial)
CREATE TABLE store_plus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  descricao TEXT DEFAULT '',
  preco NUMERIC(10,2) NOT NULL DEFAULT 0,
  comissao_implantacao_pct NUMERIC(5,2) NOT NULL DEFAULT 50,
  comissao_recorrente_pct NUMERIC(5,2) NOT NULL DEFAULT 20,
  multinivel BOOLEAN DEFAULT TRUE,
  detalhes TEXT DEFAULT '',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE store_implantacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_planos ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_pacotes_extra ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_plus ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_implantacao" ON store_implantacao FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "admin_read_implantacao" ON store_implantacao FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role = 'platform_admin'));
CREATE POLICY "admin_write_implantacao" ON store_implantacao FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role = 'platform_admin'));

CREATE POLICY "service_role_full_planos" ON store_planos FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "admin_read_planos" ON store_planos FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role = 'platform_admin'));
CREATE POLICY "admin_write_planos" ON store_planos FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role = 'platform_admin'));
CREATE POLICY "user_read_planos" ON store_planos FOR SELECT TO authenticated USING (is_active = true);

CREATE POLICY "service_role_full_pacotes" ON store_pacotes_extra FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "admin_read_pacotes" ON store_pacotes_extra FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role = 'platform_admin'));
CREATE POLICY "admin_write_pacotes" ON store_pacotes_extra FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role = 'platform_admin'));
CREATE POLICY "user_read_pacotes" ON store_pacotes_extra FOR SELECT TO authenticated USING (is_active = true);

CREATE POLICY "service_role_full_plus" ON store_plus FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "admin_read_plus" ON store_plus FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role = 'platform_admin'));
CREATE POLICY "admin_write_plus" ON store_plus FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role = 'platform_admin'));
CREATE POLICY "user_read_plus" ON store_plus FOR SELECT TO authenticated USING (is_active = true);

-- Seed: Implantacao
INSERT INTO store_implantacao (nome, descricao, preco) VALUES
('Implantacao', 'Taxa de acesso a plataforma. Pagamento unico para ativar sua conta e ter acesso completo ao sistema.', 1000.00);

-- Seed: Planos
INSERT INTO store_planos (nome, descricao, preco_mensal, modelo_llm_id, max_conversas, max_ciclos_por_conversa, dias_expiracao, ordem) VALUES
('Plano 1', 'Plano com Qwen 2.5 72B. Ideal para comecar com custo acessivel e alta performance.', 1000.00, 'd8a86326-ca57-41ef-b7ae-ee808a4e1ca1', 1000, 30, 30, 1),
('Plano 2', 'Plano com GPT-4.1. Modelo avancado da OpenAI para conversas de alta qualidade.', 2400.00, 'c08633d2-1662-4dd7-a3ed-afaa36f88846', 1000, 30, 30, 2),
('Plano 3', 'Plano com Claude Sonnet 4.5. O modelo mais inteligente do mercado para conversas premium.', 3500.00, 'dd9088a2-f206-4f54-bfc7-6c5720c99dec', 1000, 30, 30, 3);

-- Seed: Pacotes extras (metade do valor de cada plano)
INSERT INTO store_pacotes_extra (plano_id, nome, descricao, conversas, preco)
SELECT id, 'Pacote Extra - ' || nome, '500 conversas adicionais para o ' || nome, 500, preco_mensal / 2
FROM store_planos;

-- Seed: Plus
INSERT INTO store_plus (nome, descricao, preco, comissao_implantacao_pct, comissao_recorrente_pct, multinivel, detalhes) VALUES
('Socio Comercial', 'Torne-se um Socio Comercial e lucre com a plataforma.', 7700.00, 50, 20, true,
'Lucre metade da implantacao de cada usuario que voce cadastrar. Ganhe 20% de comissao recorrente sobre todos os usuarios ativos da sua rede. Cadastre outros Socios Comerciais e ganhe lucro em varios niveis, de forma recorrente.');

;
