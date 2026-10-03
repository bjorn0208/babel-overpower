
-- SECURITY FIX: impedir que usuário modifique parent_user_id ou system_role no próprio profile
-- Sem isso, team member pode setar parent_user_id = NULL e virar principal
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;

CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (
    id = (SELECT auth.uid())
    AND parent_user_id IS NOT DISTINCT FROM (
      SELECT p.parent_user_id FROM public.profiles p WHERE p.id = (SELECT auth.uid())
    )
    AND system_role IS NOT DISTINCT FROM (
      SELECT p.system_role FROM public.profiles p WHERE p.id = (SELECT auth.uid())
    )
  );

;
