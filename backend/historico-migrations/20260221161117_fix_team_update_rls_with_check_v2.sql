DROP POLICY IF EXISTS profiles_update_my_team ON profiles;
CREATE POLICY profiles_update_my_team ON profiles
  FOR UPDATE
  USING (parent_user_id = auth.uid())
  WITH CHECK (true);
;
