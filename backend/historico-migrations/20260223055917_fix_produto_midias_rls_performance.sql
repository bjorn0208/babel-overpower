
-- Drop all existing policies
DROP POLICY IF EXISTS produto_midias_select_own ON public.produto_midias;
DROP POLICY IF EXISTS produto_midias_insert_own ON public.produto_midias;
DROP POLICY IF EXISTS produto_midias_update_own ON public.produto_midias;
DROP POLICY IF EXISTS produto_midias_delete_own ON public.produto_midias;
DROP POLICY IF EXISTS produto_midias_admin_all ON public.produto_midias;

-- Recreate with (select auth.uid()) for performance
CREATE POLICY produto_midias_select_own ON public.produto_midias
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.produtos p
      WHERE p.id = produto_midias.produto_id AND p.user_id = (select auth.uid())
    )
  );

CREATE POLICY produto_midias_insert_own ON public.produto_midias
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.produtos p
      WHERE p.id = produto_midias.produto_id AND p.user_id = (select auth.uid())
    )
  );

CREATE POLICY produto_midias_update_own ON public.produto_midias
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.produtos p
      WHERE p.id = produto_midias.produto_id AND p.user_id = (select auth.uid())
    )
  );

CREATE POLICY produto_midias_delete_own ON public.produto_midias
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.produtos p
      WHERE p.id = produto_midias.produto_id AND p.user_id = (select auth.uid())
    )
  );

-- Admin policy restricted to authenticated role
CREATE POLICY produto_midias_admin_all ON public.produto_midias
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (select auth.uid()) AND profiles.system_role = 'platform_admin'
    )
  );

;
