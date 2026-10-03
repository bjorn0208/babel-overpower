
-- Fix: admin bloqueado em contract_settings e client_documents

-- contract_settings: adicionar is_platform_admin() em SELECT, INSERT, UPDATE
DROP POLICY IF EXISTS "cs_auth_select" ON public.contract_settings;
CREATE POLICY "cs_auth_select" ON public.contract_settings
  FOR SELECT TO authenticated
  USING (
    (tenant_id = (SELECT auth.uid()))
    OR (tenant_id IN (SELECT id FROM public.profiles WHERE parent_user_id = (SELECT auth.uid())))
    OR is_platform_admin()
  );

DROP POLICY IF EXISTS "cs_auth_insert" ON public.contract_settings;
CREATE POLICY "cs_auth_insert" ON public.contract_settings
  FOR INSERT TO authenticated
  WITH CHECK (
    (tenant_id = (SELECT auth.uid()))
    OR (tenant_id IN (SELECT id FROM public.profiles WHERE parent_user_id = (SELECT auth.uid())))
    OR is_platform_admin()
  );

DROP POLICY IF EXISTS "cs_auth_update" ON public.contract_settings;
CREATE POLICY "cs_auth_update" ON public.contract_settings
  FOR UPDATE TO authenticated
  USING (
    (tenant_id = (SELECT auth.uid()))
    OR (tenant_id IN (SELECT id FROM public.profiles WHERE parent_user_id = (SELECT auth.uid())))
    OR is_platform_admin()
  )
  WITH CHECK (
    (tenant_id = (SELECT auth.uid()))
    OR (tenant_id IN (SELECT id FROM public.profiles WHERE parent_user_id = (SELECT auth.uid())))
    OR is_platform_admin()
  );

-- client_documents: adicionar is_platform_admin() em SELECT, INSERT, UPDATE, DELETE
DROP POLICY IF EXISTS "user_read_own_docs" ON public.client_documents;
CREATE POLICY "user_read_own_docs" ON public.client_documents
  FOR SELECT TO authenticated
  USING (
    (tenant_id = (SELECT auth.uid()))
    OR (tenant_id IN (SELECT parent_user_id FROM public.profiles WHERE id = (SELECT auth.uid()) AND parent_user_id IS NOT NULL))
    OR is_platform_admin()
  );

DROP POLICY IF EXISTS "user_insert_own_docs" ON public.client_documents;
CREATE POLICY "user_insert_own_docs" ON public.client_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    (tenant_id = (SELECT auth.uid()))
    OR (tenant_id IN (SELECT parent_user_id FROM public.profiles WHERE id = (SELECT auth.uid()) AND parent_user_id IS NOT NULL))
    OR is_platform_admin()
  );

DROP POLICY IF EXISTS "user_update_own_docs" ON public.client_documents;
CREATE POLICY "user_update_own_docs" ON public.client_documents
  FOR UPDATE TO authenticated
  USING (
    (tenant_id = (SELECT auth.uid()))
    OR (tenant_id IN (SELECT parent_user_id FROM public.profiles WHERE id = (SELECT auth.uid()) AND parent_user_id IS NOT NULL))
    OR is_platform_admin()
  );

DROP POLICY IF EXISTS "user_delete_own_docs" ON public.client_documents;
CREATE POLICY "user_delete_own_docs" ON public.client_documents
  FOR DELETE TO authenticated
  USING (
    (tenant_id = (SELECT auth.uid()))
    OR (tenant_id IN (SELECT parent_user_id FROM public.profiles WHERE id = (SELECT auth.uid()) AND parent_user_id IS NOT NULL))
    OR is_platform_admin()
  );

;
