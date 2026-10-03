
-- ============================================================
-- 022 TRIGGER: handle_new_user (auth.users -> profiles)
-- Depende de: profiles, tenants, invitations, profile_roles, roles, credit_wallets
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  _tenant_id UUID;
  _invite RECORD;
BEGIN
  -- Verifica se existe convite pendente
  SELECT * INTO _invite
  FROM invitations
  WHERE email = NEW.email
    AND status = 'pending'
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF _invite IS NOT NULL THEN
    _tenant_id := _invite.tenant_id;

    INSERT INTO profiles (id, tenant_id, email, full_name)
    VALUES (
      NEW.id,
      _tenant_id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'full_name', '')
    );

    INSERT INTO profile_roles (profile_id, role_id, tenant_id, granted_by)
    VALUES (NEW.id, _invite.role_id, _tenant_id, _invite.invited_by);

    UPDATE invitations
    SET status = 'accepted', accepted_at = now()
    WHERE id = _invite.id;

  ELSE
    INSERT INTO tenants (name, slug)
    VALUES (
      COALESCE(NEW.raw_user_meta_data->>'company_name', 'Minha Empresa'),
      COALESCE(NEW.raw_user_meta_data->>'slug', replace(gen_random_uuid()::text, '-', ''))
    )
    RETURNING id INTO _tenant_id;

    INSERT INTO profiles (id, tenant_id, email, full_name)
    VALUES (
      NEW.id,
      _tenant_id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'full_name', '')
    );

    UPDATE tenants SET owner_id = NEW.id WHERE id = _tenant_id;

    INSERT INTO profile_roles (profile_id, role_id, tenant_id, granted_by)
    SELECT NEW.id, r.id, _tenant_id, NEW.id
    FROM roles r WHERE r.slug = 'tenant_owner';

    INSERT INTO credit_wallets (tenant_id)
    VALUES (_tenant_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

;
