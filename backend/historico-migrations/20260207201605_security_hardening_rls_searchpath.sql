
-- ============================================================
-- SECURITY HARDENING
-- 1. RLS + SELECT policy em 13 tabelas lookup/sistema
-- 2. SET search_path em 5 funcoes SECURITY DEFINER
-- 3. Policy SELECT em rate_limits (ja tem RLS, faltava policy)
-- ============================================================

-- ============================================================
-- PARTE 1: RLS + SELECT POLICY nas tabelas lookup
-- Regra: authenticated pode ler. Ninguem escreve via PostgREST.
-- Edge Functions usam service_role (bypassa RLS).
-- ============================================================

-- roles
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roles_select_authenticated"
  ON roles FOR SELECT TO authenticated
  USING (true);

-- permissions
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "permissions_select_authenticated"
  ON permissions FOR SELECT TO authenticated
  USING (true);

-- role_permissions
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "role_permissions_select_authenticated"
  ON role_permissions FOR SELECT TO authenticated
  USING (true);

-- config_options
ALTER TABLE config_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "config_options_select_authenticated"
  ON config_options FOR SELECT TO authenticated
  USING (true);

-- platform_configs
ALTER TABLE platform_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "platform_configs_select_authenticated"
  ON platform_configs FOR SELECT TO authenticated
  USING (true);

-- plans
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plans_select_authenticated"
  ON plans FOR SELECT TO authenticated
  USING (true);

-- llm_models
ALTER TABLE llm_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY "llm_models_select_authenticated"
  ON llm_models FOR SELECT TO authenticated
  USING (true);

-- block_type_definitions
ALTER TABLE block_type_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "block_type_definitions_select_authenticated"
  ON block_type_definitions FOR SELECT TO authenticated
  USING (true);

-- capture_type_definitions
ALTER TABLE capture_type_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "capture_type_definitions_select_authenticated"
  ON capture_type_definitions FOR SELECT TO authenticated
  USING (true);

-- credit_packages
ALTER TABLE credit_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "credit_packages_select_authenticated"
  ON credit_packages FOR SELECT TO authenticated
  USING (true);

-- security_patterns
ALTER TABLE security_patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "security_patterns_select_authenticated"
  ON security_patterns FOR SELECT TO authenticated
  USING (true);

-- conversation_locks
ALTER TABLE conversation_locks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conversation_locks_select_authenticated"
  ON conversation_locks FOR SELECT TO authenticated
  USING (true);

-- webhook_dedup
ALTER TABLE webhook_dedup ENABLE ROW LEVEL SECURITY;
CREATE POLICY "webhook_dedup_select_authenticated"
  ON webhook_dedup FOR SELECT TO authenticated
  USING (true);

-- ============================================================
-- PARTE 2: Policy para rate_limits (ja tem RLS, faltava policy)
-- ============================================================

CREATE POLICY "rate_limits_select_authenticated"
  ON rate_limits FOR SELECT TO authenticated
  USING (true);

-- ============================================================
-- PARTE 3: SET search_path nas funcoes SECURITY DEFINER
-- Recria cada funcao com SET search_path = public
-- ============================================================

CREATE OR REPLACE FUNCTION get_user_tenant_id()
RETURNS UUID AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT is_platform_admin FROM public.profiles WHERE id = auth.uid()),
    false
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT r.slug FROM public.profile_roles pr
  JOIN public.roles r ON r.id = pr.role_id
  WHERE pr.profile_id = auth.uid()
    AND pr.tenant_id = get_user_tenant_id()
    AND pr.revoked_at IS NULL
  ORDER BY r.slug
  LIMIT 1
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION has_permission(_permission_slug TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profile_roles pr
    JOIN public.role_permissions rp ON rp.role_id = pr.role_id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE pr.profile_id = auth.uid()
      AND pr.tenant_id = get_user_tenant_id()
      AND pr.revoked_at IS NULL
      AND p.slug = _permission_slug
  ) OR is_platform_admin()
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  _tenant_id UUID;
  _invite RECORD;
BEGIN
  SELECT * INTO _invite
  FROM public.invitations
  WHERE email = NEW.email
    AND status = 'pending'
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF _invite IS NOT NULL THEN
    _tenant_id := _invite.tenant_id;

    INSERT INTO public.profiles (id, tenant_id, email, full_name)
    VALUES (
      NEW.id,
      _tenant_id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'full_name', '')
    );

    INSERT INTO public.profile_roles (profile_id, role_id, tenant_id, granted_by)
    VALUES (NEW.id, _invite.role_id, _tenant_id, _invite.invited_by);

    UPDATE public.invitations
    SET status = 'accepted', accepted_at = now()
    WHERE id = _invite.id;

  ELSE
    INSERT INTO public.tenants (name, slug)
    VALUES (
      COALESCE(NEW.raw_user_meta_data->>'company_name', 'Minha Empresa'),
      COALESCE(NEW.raw_user_meta_data->>'slug', replace(gen_random_uuid()::text, '-', ''))
    )
    RETURNING id INTO _tenant_id;

    INSERT INTO public.profiles (id, tenant_id, email, full_name)
    VALUES (
      NEW.id,
      _tenant_id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'full_name', '')
    );

    UPDATE public.tenants SET owner_id = NEW.id WHERE id = _tenant_id;

    INSERT INTO public.profile_roles (profile_id, role_id, tenant_id, granted_by)
    SELECT NEW.id, r.id, _tenant_id, NEW.id
    FROM public.roles r WHERE r.slug = 'tenant_owner';

    INSERT INTO public.credit_wallets (tenant_id)
    VALUES (_tenant_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

;
