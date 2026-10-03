
-- ============================================================
-- 001 TENANTS TABLE (sem funcoes helper - virao depois)
-- ============================================================

CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  is_platform BOOLEAN NOT NULL DEFAULT false,
  owner_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'
);

COMMENT ON TABLE tenants IS 'Unidade raiz de isolamento. Cada organizacao cliente e um tenant.';
COMMENT ON COLUMN tenants.is_platform IS 'Se true, e o tenant reservado da plataforma (admin global). Unico.';
COMMENT ON COLUMN tenants.owner_id IS 'Profile do dono da conta. Preenchido apos bootstrap.';

CREATE INDEX idx_tenants_slug ON tenants (slug);
CREATE INDEX idx_tenants_status ON tenants (status);

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- Funcao update_updated_at (nao depende de nada)
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- BOOTSTRAP
INSERT INTO tenants (name, slug, status, is_platform)
VALUES ('Platform', 'platform', 'active', true);

;
