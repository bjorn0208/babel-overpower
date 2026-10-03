
-- ============================================================
-- 003 HELPER FUNCTIONS (dependem de profiles)
-- ============================================================

CREATE OR REPLACE FUNCTION get_user_tenant_id()
RETURNS UUID AS $$
  SELECT tenant_id FROM profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT is_platform_admin FROM profiles WHERE id = auth.uid()),
    false
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- RLS Policies para tenants (agora que get_user_tenant_id existe)
CREATE POLICY "tenant_select_own"
  ON tenants FOR SELECT
  USING (id = get_user_tenant_id() OR is_platform_admin());

CREATE POLICY "tenant_insert_admin"
  ON tenants FOR INSERT
  WITH CHECK (is_platform_admin());

CREATE POLICY "tenant_update_admin"
  ON tenants FOR UPDATE
  USING (is_platform_admin());

CREATE POLICY "tenant_delete_admin"
  ON tenants FOR DELETE
  USING (is_platform_admin());

-- RLS Policies para profiles
CREATE POLICY "profiles_select_tenant"
  ON profiles FOR SELECT
  USING (tenant_id = get_user_tenant_id() OR is_platform_admin());

CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE
  USING (id = auth.uid() OR is_platform_admin());

CREATE POLICY "profiles_insert"
  ON profiles FOR INSERT
  WITH CHECK (true);

;
