
-- ============================================================
-- 005 INVITATIONS
-- ============================================================

CREATE TABLE invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  email TEXT NOT NULL,
  role_id UUID NOT NULL REFERENCES roles(id),
  invited_by UUID NOT NULL REFERENCES profiles(id),
  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '72 hours'),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_invitations_pending
  ON invitations (tenant_id, email)
  WHERE status = 'pending';

CREATE INDEX idx_invitations_token ON invitations (token);
CREATE INDEX idx_invitations_tenant ON invitations (tenant_id);

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invitations_select"
  ON invitations FOR SELECT
  USING (tenant_id = get_user_tenant_id() OR is_platform_admin());

CREATE POLICY "invitations_insert"
  ON invitations FOR INSERT
  WITH CHECK (
    tenant_id = get_user_tenant_id()
    AND get_user_role() IN ('tenant_owner', 'team_admin')
  );

CREATE POLICY "invitations_update"
  ON invitations FOR UPDATE
  USING (
    tenant_id = get_user_tenant_id()
    AND get_user_role() IN ('tenant_owner', 'team_admin')
  );

;
