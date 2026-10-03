-- Adiciona policies de CRUD em blocos_procedurais (write + admin)
-- Espelha o padrão já existente em blocos_comportamento / blocos_conhecimento / blocos_padrao.
-- Antes desta migration, blocos_procedurais era READ-ONLY pra authenticated → frontend
-- da curadoria batia 403 ao criar/editar/deletar diretriz procedural.

-- 1. Admin da plataforma faz tudo (igual outras famílias)
DROP POLICY IF EXISTS admin_all_blocos_procedurais ON public.blocos_procedurais;
CREATE POLICY admin_all_blocos_procedurais
  ON public.blocos_procedurais
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.system_role = 'platform_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.system_role = 'platform_admin'
    )
  );

-- 2. Tenant escreve nos próprios procedurais (escopo='tenant' e tenant_id = auth.uid())
DROP POLICY IF EXISTS tenant_write_blocos_procedurais ON public.blocos_procedurais;
CREATE POLICY tenant_write_blocos_procedurais
  ON public.blocos_procedurais
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (
    escopo = 'tenant'
    AND tenant_id = (SELECT auth.uid())
  )
  WITH CHECK (
    escopo = 'tenant'
    AND tenant_id = (SELECT auth.uid())
  );

-- Comentários documentais
COMMENT ON POLICY admin_all_blocos_procedurais  ON public.blocos_procedurais IS
  'Platform admin opera (CRUD) qualquer bloco procedural — para curadoria global/nicho.';
COMMENT ON POLICY tenant_write_blocos_procedurais ON public.blocos_procedurais IS
  'Tenant cria/edita/deleta os próprios procedurais (escopo=tenant, tenant_id=auth.uid()).';
;
