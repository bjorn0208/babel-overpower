DROP POLICY IF EXISTS auth_insert_own_contracts ON contracts;

CREATE POLICY auth_insert_own_contracts ON contracts
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = auth.uid()
    OR tenant_id IN (SELECT id FROM profiles WHERE parent_user_id = auth.uid())
    OR tenant_id = (SELECT parent_user_id FROM profiles WHERE id = auth.uid())
  );
;
