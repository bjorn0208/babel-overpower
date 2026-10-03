CREATE TABLE IF NOT EXISTS produto_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nicho_id uuid NOT NULL REFERENCES nichos(id) ON DELETE CASCADE,
  nome text NOT NULL,
  prazo_entrega text,
  garantia text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS produto_templates_nicho_idx ON produto_templates(nicho_id);

CREATE TABLE IF NOT EXISTS produto_template_conhecimento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_template_id uuid NOT NULL REFERENCES produto_templates(id) ON DELETE CASCADE,
  tipo text,
  titulo text,
  conteudo text,
  ordem int,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS produto_template_conhecimento_pai_idx ON produto_template_conhecimento(produto_template_id);

CREATE TABLE IF NOT EXISTS produto_template_midias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_template_id uuid NOT NULL REFERENCES produto_templates(id) ON DELETE CASCADE,
  arquivo_url text NOT NULL,
  arquivo_nome text,
  arquivo_tipo text,
  descricao text,
  ordem int,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS produto_template_midias_pai_idx ON produto_template_midias(produto_template_id);

ALTER TABLE produto_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE produto_template_conhecimento ENABLE ROW LEVEL SECURITY;
ALTER TABLE produto_template_midias ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['produto_templates','produto_template_conhecimento','produto_template_midias']) LOOP
    EXECUTE format('DROP POLICY IF EXISTS service_role_all ON %I; CREATE POLICY service_role_all ON %I FOR ALL TO service_role USING (true) WITH CHECK (true);', t, t);
    EXECUTE format('DROP POLICY IF EXISTS admin_all ON %I; CREATE POLICY admin_all ON %I FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = (SELECT auth.uid()) AND system_role = ''platform_admin'')) WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = (SELECT auth.uid()) AND system_role = ''platform_admin''));', t, t);
  END LOOP;
END $$;
;
