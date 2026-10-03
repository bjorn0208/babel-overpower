-- Allow users to see profiles referred by them (for multinivel/rede page)
-- COALESCE needed: owner has parent_user_id=NULL so falls back to own id
-- Team member has parent_user_id set, sees owner's referrals
CREATE POLICY "users_read_own_referrals"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    referred_by = (
      SELECT COALESCE(p.parent_user_id, p.id)
      FROM public.profiles p
      WHERE p.id = auth.uid()
    )
  );
;
