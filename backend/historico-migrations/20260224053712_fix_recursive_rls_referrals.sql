-- Função SECURITY DEFINER para resolver owner de referral sem recursão RLS
CREATE OR REPLACE FUNCTION get_referral_owner_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(p.parent_user_id, p.id)
  FROM public.profiles p
  WHERE p.id = auth.uid()
$$;

-- Recriar policy sem subquery recursiva
DROP POLICY IF EXISTS users_read_own_referrals ON profiles;
CREATE POLICY users_read_own_referrals ON profiles
  FOR SELECT
  TO authenticated
  USING (referred_by = get_referral_owner_id());
;
