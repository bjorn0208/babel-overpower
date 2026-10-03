
-- ============================================================
-- 002 PROFILES TABLE (sem trigger handle_new_user - vira depois)
-- ============================================================

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  email TEXT NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  is_platform_admin BOOLEAN NOT NULL DEFAULT false,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'
);

COMMENT ON TABLE profiles IS 'Usuario humano. ID = auth.users.id. Sempre pertence a um tenant.';
COMMENT ON COLUMN profiles.is_platform_admin IS 'Se true, admin global com acesso total a todos os tenants.';

CREATE UNIQUE INDEX idx_profiles_email ON profiles (email);
CREATE INDEX idx_profiles_tenant ON profiles (tenant_id);
CREATE INDEX idx_profiles_status ON profiles (status);

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

;
