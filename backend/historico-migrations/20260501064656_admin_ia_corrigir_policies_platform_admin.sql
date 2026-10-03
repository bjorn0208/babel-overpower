-- Corrige policies: system_role real é 'platform_admin' (não 'admin'/'superadmin')
DROP POLICY IF EXISTS "admin_ia_actions_admin_only_select" ON public.admin_ia_actions;
DROP POLICY IF EXISTS "admin_ia_actions_admin_only_insert" ON public.admin_ia_actions;
DROP POLICY IF EXISTS "admin_ia_chunks_admin_only" ON public.admin_ia_chunks;

CREATE POLICY "admin_ia_actions_platform_admin_select" ON public.admin_ia_actions
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (select auth.uid()) AND p.system_role = 'platform_admin')
  );

CREATE POLICY "admin_ia_actions_platform_admin_insert" ON public.admin_ia_actions
  FOR INSERT TO authenticated
  WITH CHECK (
    actor_user_id = (select auth.uid())
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (select auth.uid()) AND p.system_role = 'platform_admin')
  );

CREATE POLICY "admin_ia_chunks_platform_admin" ON public.admin_ia_chunks
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (select auth.uid()) AND p.system_role = 'platform_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (select auth.uid()) AND p.system_role = 'platform_admin'));
;
