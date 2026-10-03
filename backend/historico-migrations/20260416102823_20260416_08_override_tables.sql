-- 4 tabelas de override espelhando behavior_chunks_tenant_overrides
CREATE TABLE IF NOT EXISTS trigger_chunks_tenant_overrides (
  chunk_id uuid REFERENCES trigger_chunks(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ativo boolean NOT NULL DEFAULT false,
  motivo text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chunk_id, tenant_id)
);
CREATE INDEX IF NOT EXISTS trigger_overrides_tenant_idx ON trigger_chunks_tenant_overrides(tenant_id);

CREATE TABLE IF NOT EXISTS human_chunks_tenant_overrides (
  chunk_id uuid REFERENCES human_chunks(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ativo boolean NOT NULL DEFAULT false,
  motivo text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chunk_id, tenant_id)
);
CREATE INDEX IF NOT EXISTS human_overrides_tenant_idx ON human_chunks_tenant_overrides(tenant_id);

CREATE TABLE IF NOT EXISTS variation_chunks_tenant_overrides (
  chunk_id uuid REFERENCES variation_chunks(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ativo boolean NOT NULL DEFAULT false,
  motivo text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chunk_id, tenant_id)
);
CREATE INDEX IF NOT EXISTS variation_overrides_tenant_idx ON variation_chunks_tenant_overrides(tenant_id);

CREATE TABLE IF NOT EXISTS knowledge_chunks_tenant_overrides (
  chunk_id uuid REFERENCES knowledge_chunks(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ativo boolean NOT NULL DEFAULT false,
  motivo text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chunk_id, tenant_id)
);
CREATE INDEX IF NOT EXISTS knowledge_overrides_tenant_idx ON knowledge_chunks_tenant_overrides(tenant_id);

-- RLS nas 4 novas
ALTER TABLE trigger_chunks_tenant_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE human_chunks_tenant_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE variation_chunks_tenant_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_chunks_tenant_overrides ENABLE ROW LEVEL SECURITY;

-- policies via loop
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'trigger_chunks_tenant_overrides',
    'human_chunks_tenant_overrides',
    'variation_chunks_tenant_overrides',
    'knowledge_chunks_tenant_overrides'
  ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS service_role_all ON %I; CREATE POLICY service_role_all ON %I FOR ALL TO service_role USING (true) WITH CHECK (true);', t, t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_own ON %I; CREATE POLICY tenant_own ON %I FOR ALL TO authenticated USING (tenant_id = (SELECT auth.uid())) WITH CHECK (tenant_id = (SELECT auth.uid()));', t, t);
    EXECUTE format('DROP POLICY IF EXISTS admin_all ON %I; CREATE POLICY admin_all ON %I FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = (SELECT auth.uid()) AND system_role = ''platform_admin'')) WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = (SELECT auth.uid()) AND system_role = ''platform_admin''));', t, t);
  END LOOP;
END $$;
;
