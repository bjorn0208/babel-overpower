
-- Fix 7 RLS policies: auth.uid() -> (select auth.uid()) for initplan optimization

-- 1. channels.user_insert_own_channel
DROP POLICY IF EXISTS "user_insert_own_channel" ON channels;
CREATE POLICY "user_insert_own_channel" ON channels FOR INSERT TO authenticated
WITH CHECK (
  user_id = (select auth.uid()) OR user_id = (
    SELECT profiles.parent_user_id FROM profiles WHERE profiles.id = (select auth.uid())
  )
);

-- 2. client_documents.user_insert_own_docs
DROP POLICY IF EXISTS "user_insert_own_docs" ON client_documents;
CREATE POLICY "user_insert_own_docs" ON client_documents FOR INSERT TO authenticated
WITH CHECK (
  tenant_id = (select auth.uid()) OR tenant_id IN (
    SELECT profiles.parent_user_id FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.parent_user_id IS NOT NULL
  )
);

-- 3. contract_settings.cs_auth_insert
DROP POLICY IF EXISTS "cs_auth_insert" ON contract_settings;
CREATE POLICY "cs_auth_insert" ON contract_settings FOR INSERT TO authenticated
WITH CHECK (
  tenant_id = (select auth.uid()) OR tenant_id IN (
    SELECT profiles.id FROM profiles WHERE profiles.parent_user_id = (select auth.uid())
  )
);

-- 4. contracts.auth_insert_own_contracts
DROP POLICY IF EXISTS "auth_insert_own_contracts" ON contracts;
CREATE POLICY "auth_insert_own_contracts" ON contracts FOR INSERT TO authenticated
WITH CHECK (
  tenant_id = (select auth.uid()) OR tenant_id IN (
    SELECT profiles.id FROM profiles WHERE profiles.parent_user_id = (select auth.uid())
  ) OR tenant_id = (
    SELECT profiles.parent_user_id FROM profiles WHERE profiles.id = (select auth.uid())
  ) OR is_platform_admin()
);

-- 5. multinivel_saques."User pode criar saque"
DROP POLICY IF EXISTS "User pode criar saque" ON multinivel_saques;
CREATE POLICY "User pode criar saque" ON multinivel_saques FOR INSERT TO authenticated
WITH CHECK (user_id = (select auth.uid()));

-- 6. produto_conhecimento.produto_conhecimento_insert_own
DROP POLICY IF EXISTS "produto_conhecimento_insert_own" ON produto_conhecimento;
CREATE POLICY "produto_conhecimento_insert_own" ON produto_conhecimento FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM produtos WHERE produtos.id = produto_conhecimento.produto_id AND produtos.user_id = (select auth.uid()))
);

-- 7. socios.socios_insert_own
DROP POLICY IF EXISTS "socios_insert_own" ON socios;
CREATE POLICY "socios_insert_own" ON socios FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM empresas WHERE empresas.id = socios.empresa_id AND empresas.user_id = (select auth.uid()))
);

;
