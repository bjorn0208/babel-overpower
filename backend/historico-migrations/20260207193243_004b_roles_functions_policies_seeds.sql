
-- ============================================================
-- 004b FUNCTIONS + POLICIES + SEEDS
-- ============================================================

-- get_user_role
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT r.slug FROM profile_roles pr
  JOIN roles r ON r.id = pr.role_id
  WHERE pr.profile_id = auth.uid()
    AND pr.tenant_id = get_user_tenant_id()
    AND pr.revoked_at IS NULL
  ORDER BY r.slug
  LIMIT 1
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- has_permission
CREATE OR REPLACE FUNCTION has_permission(_permission_slug TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profile_roles pr
    JOIN role_permissions rp ON rp.role_id = pr.role_id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE pr.profile_id = auth.uid()
      AND pr.tenant_id = get_user_tenant_id()
      AND pr.revoked_at IS NULL
      AND p.slug = _permission_slug
  ) OR is_platform_admin()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Policies
CREATE POLICY "profile_roles_select"
  ON profile_roles FOR SELECT
  USING (tenant_id = get_user_tenant_id() OR is_platform_admin());

CREATE POLICY "profile_roles_manage"
  ON profile_roles FOR ALL
  USING (is_platform_admin() OR (
    tenant_id = get_user_tenant_id()
    AND get_user_role() IN ('tenant_owner', 'team_admin')
  ));

-- Seed role_permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.slug = 'tenant_owner';

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.slug = 'team_admin' AND p.slug NOT IN ('billing.manage');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.slug = 'team_operator' AND p.slug IN (
  'dashboard.view', 'conversations.view', 'conversations.respond',
  'agents.view', 'knowledge.view', 'knowledge.edit',
  'leads.view', 'leads.manage', 'flows.view', 'security.view'
);

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.slug = 'team_viewer' AND p.slug IN (
  'dashboard.view', 'conversations.view', 'agents.view',
  'knowledge.view', 'leads.view', 'flows.view'
);

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.slug = 'platform_admin';

;
