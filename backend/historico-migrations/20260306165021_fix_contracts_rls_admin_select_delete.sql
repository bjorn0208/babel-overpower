
-- Fix: admin não conseguia ver/deletar contratos de outros usuários
-- Adiciona is_platform_admin() nas policies SELECT e DELETE de contracts

DROP POLICY IF EXISTS "auth_select_own_contracts" ON public.contracts;
CREATE POLICY "auth_select_own_contracts" ON public.contracts
  FOR SELECT TO authenticated
  USING (
    (tenant_id = (SELECT auth.uid()))
    OR (tenant_id IN (SELECT id FROM public.profiles WHERE parent_user_id = (SELECT auth.uid())))
    OR is_platform_admin()
  );

DROP POLICY IF EXISTS "auth_delete_own_contracts" ON public.contracts;
CREATE POLICY "auth_delete_own_contracts" ON public.contracts
  FOR DELETE TO authenticated
  USING (
    (tenant_id = (SELECT auth.uid()))
    OR (tenant_id IN (SELECT id FROM public.profiles WHERE parent_user_id = (SELECT auth.uid())))
    OR is_platform_admin()
  );

;
