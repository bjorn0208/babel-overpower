DROP POLICY IF EXISTS admin_all_behavior_chunks ON behavior_chunks;
CREATE POLICY admin_all_behavior_chunks ON behavior_chunks
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = (SELECT auth.uid()) AND system_role = 'platform_admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = (SELECT auth.uid()) AND system_role = 'platform_admin')
  );
;
