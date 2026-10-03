
-- Fix auth.uid() -> (select auth.uid()) em policies restantes (performance initplan)

-- channels
DROP POLICY IF EXISTS "user_update_own_channel" ON channels;
CREATE POLICY "user_update_own_channel" ON channels FOR UPDATE TO authenticated
  USING ((user_id = (select auth.uid())) OR (user_id = (SELECT profiles.parent_user_id FROM profiles WHERE profiles.id = (select auth.uid()))))
  WITH CHECK ((user_id = (select auth.uid())) OR (user_id = (SELECT profiles.parent_user_id FROM profiles WHERE profiles.id = (select auth.uid()))));

-- client_documents
DROP POLICY IF EXISTS "user_read_own_docs" ON client_documents;
CREATE POLICY "user_read_own_docs" ON client_documents FOR SELECT TO authenticated
  USING ((tenant_id = (select auth.uid())) OR (tenant_id IN (SELECT profiles.parent_user_id FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.parent_user_id IS NOT NULL)));

DROP POLICY IF EXISTS "user_update_own_docs" ON client_documents;
CREATE POLICY "user_update_own_docs" ON client_documents FOR UPDATE TO authenticated
  USING ((tenant_id = (select auth.uid())) OR (tenant_id IN (SELECT profiles.parent_user_id FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.parent_user_id IS NOT NULL)));

DROP POLICY IF EXISTS "user_delete_own_docs" ON client_documents;
CREATE POLICY "user_delete_own_docs" ON client_documents FOR DELETE TO authenticated
  USING ((tenant_id = (select auth.uid())) OR (tenant_id IN (SELECT profiles.parent_user_id FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.parent_user_id IS NOT NULL)));

-- contract_settings
DROP POLICY IF EXISTS "cs_auth_update" ON contract_settings;
CREATE POLICY "cs_auth_update" ON contract_settings FOR UPDATE TO authenticated
  USING ((tenant_id = (select auth.uid())) OR (tenant_id IN (SELECT profiles.id FROM profiles WHERE profiles.parent_user_id = (select auth.uid()))));

DROP POLICY IF EXISTS "cs_auth_select" ON contract_settings;
CREATE POLICY "cs_auth_select" ON contract_settings FOR SELECT TO authenticated
  USING ((tenant_id = (select auth.uid())) OR (tenant_id IN (SELECT profiles.id FROM profiles WHERE profiles.parent_user_id = (select auth.uid()))));

-- contracts
DROP POLICY IF EXISTS "auth_delete_own_contracts" ON contracts;
CREATE POLICY "auth_delete_own_contracts" ON contracts FOR DELETE TO authenticated
  USING ((tenant_id = (select auth.uid())) OR (tenant_id IN (SELECT profiles.id FROM profiles WHERE profiles.parent_user_id = (select auth.uid()))));

DROP POLICY IF EXISTS "auth_update_own_contracts" ON contracts;
CREATE POLICY "auth_update_own_contracts" ON contracts FOR UPDATE TO authenticated
  USING ((tenant_id = (select auth.uid())) OR (tenant_id IN (SELECT profiles.id FROM profiles WHERE profiles.parent_user_id = (select auth.uid()))) OR is_platform_admin())
  WITH CHECK ((tenant_id = (select auth.uid())) OR (tenant_id IN (SELECT profiles.id FROM profiles WHERE profiles.parent_user_id = (select auth.uid()))) OR is_platform_admin());

DROP POLICY IF EXISTS "auth_select_own_contracts" ON contracts;
CREATE POLICY "auth_select_own_contracts" ON contracts FOR SELECT TO authenticated
  USING ((tenant_id = (select auth.uid())) OR (tenant_id IN (SELECT profiles.id FROM profiles WHERE profiles.parent_user_id = (select auth.uid()))));

-- contratos_template
DROP POLICY IF EXISTS "own_contratos_template" ON contratos_template;
CREATE POLICY "own_contratos_template" ON contratos_template FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "admin_read_contratos_template" ON contratos_template;
CREATE POLICY "admin_read_contratos_template" ON contratos_template FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.system_role = 'platform_admin'));

-- conversations
DROP POLICY IF EXISTS "user_delete_own_conversations" ON conversations;
CREATE POLICY "user_delete_own_conversations" ON conversations FOR DELETE TO authenticated
  USING ((tenant_id = (select auth.uid())) OR (tenant_id IN (SELECT profiles.parent_user_id FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.parent_user_id IS NOT NULL)));

-- multinivel_comissoes
DROP POLICY IF EXISTS "Admin pode tudo em multinivel_comissoes" ON multinivel_comissoes;
CREATE POLICY "admin_all_comissoes" ON multinivel_comissoes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.system_role = 'platform_admin'));

DROP POLICY IF EXISTS "User ve proprias comissoes" ON multinivel_comissoes;
CREATE POLICY "user_read_own_comissoes" ON multinivel_comissoes FOR SELECT TO authenticated
  USING (beneficiario_id = (select auth.uid()));

-- multinivel_niveis
DROP POLICY IF EXISTS "Admin pode tudo em multinivel_niveis" ON multinivel_niveis;
CREATE POLICY "admin_all_niveis" ON multinivel_niveis FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.system_role = 'platform_admin'));

-- multinivel_saques
DROP POLICY IF EXISTS "User ve proprios saques" ON multinivel_saques;
CREATE POLICY "user_read_own_saques" ON multinivel_saques FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Admin pode tudo em multinivel_saques" ON multinivel_saques;
CREATE POLICY "admin_all_saques" ON multinivel_saques FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.system_role = 'platform_admin'));

-- produto_conhecimento
DROP POLICY IF EXISTS "produto_conhecimento_select_own" ON produto_conhecimento;
CREATE POLICY "produto_conhecimento_select_own" ON produto_conhecimento FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM produtos WHERE produtos.id = produto_conhecimento.produto_id AND produtos.user_id = (select auth.uid())));

DROP POLICY IF EXISTS "produto_conhecimento_update_own" ON produto_conhecimento;
CREATE POLICY "produto_conhecimento_update_own" ON produto_conhecimento FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM produtos WHERE produtos.id = produto_conhecimento.produto_id AND produtos.user_id = (select auth.uid())));

DROP POLICY IF EXISTS "produto_conhecimento_delete_own" ON produto_conhecimento;
CREATE POLICY "produto_conhecimento_delete_own" ON produto_conhecimento FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM produtos WHERE produtos.id = produto_conhecimento.produto_id AND produtos.user_id = (select auth.uid())));

DROP POLICY IF EXISTS "produto_conhecimento_admin_all" ON produto_conhecimento;
CREATE POLICY "produto_conhecimento_admin_all" ON produto_conhecimento FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.system_role = 'platform_admin'));

-- produtos
DROP POLICY IF EXISTS "produtos_admin_all" ON produtos;
CREATE POLICY "produtos_admin_all" ON produtos FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.system_role = 'platform_admin'));

-- socios
DROP POLICY IF EXISTS "socios_select_own" ON socios;
CREATE POLICY "socios_select_own" ON socios FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM empresas WHERE empresas.id = socios.empresa_id AND empresas.user_id = (select auth.uid())));

DROP POLICY IF EXISTS "socios_update_own" ON socios;
CREATE POLICY "socios_update_own" ON socios FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM empresas WHERE empresas.id = socios.empresa_id AND empresas.user_id = (select auth.uid())));

DROP POLICY IF EXISTS "socios_delete_own" ON socios;
CREATE POLICY "socios_delete_own" ON socios FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM empresas WHERE empresas.id = socios.empresa_id AND empresas.user_id = (select auth.uid())));

DROP POLICY IF EXISTS "socios_admin_all" ON socios;
CREATE POLICY "socios_admin_all" ON socios FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.system_role = 'platform_admin'));

-- store_implantacao
DROP POLICY IF EXISTS "admin_read_implantacao" ON store_implantacao;
CREATE POLICY "admin_read_implantacao" ON store_implantacao FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.system_role = 'platform_admin'));

DROP POLICY IF EXISTS "admin_write_implantacao" ON store_implantacao;
CREATE POLICY "admin_write_implantacao" ON store_implantacao FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.system_role = 'platform_admin'));

-- store_pacotes_extra
DROP POLICY IF EXISTS "admin_read_pacotes" ON store_pacotes_extra;
CREATE POLICY "admin_read_pacotes" ON store_pacotes_extra FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.system_role = 'platform_admin'));

DROP POLICY IF EXISTS "admin_write_pacotes" ON store_pacotes_extra;
CREATE POLICY "admin_write_pacotes" ON store_pacotes_extra FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.system_role = 'platform_admin'));

-- store_planos
DROP POLICY IF EXISTS "admin_read_planos" ON store_planos;
CREATE POLICY "admin_read_planos" ON store_planos FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.system_role = 'platform_admin'));

DROP POLICY IF EXISTS "admin_write_planos" ON store_planos;
CREATE POLICY "admin_write_planos" ON store_planos FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.system_role = 'platform_admin'));

-- store_plus
DROP POLICY IF EXISTS "admin_read_plus" ON store_plus;
CREATE POLICY "admin_read_plus" ON store_plus FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.system_role = 'platform_admin'));

DROP POLICY IF EXISTS "admin_write_plus" ON store_plus;
CREATE POLICY "admin_write_plus" ON store_plus FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.system_role = 'platform_admin'));

-- user_agents
DROP POLICY IF EXISTS "user_read_own_agent" ON user_agents;
CREATE POLICY "user_read_own_agent" ON user_agents FOR SELECT TO authenticated
  USING ((user_id = (select auth.uid())) OR (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.parent_user_id = user_agents.user_id)));

;
