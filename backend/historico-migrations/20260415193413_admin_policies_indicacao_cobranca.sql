-- Admin platform pode fazer CRUD em indicacao_campanhas e cobranca_configs
-- (necessário para impersonação: admin mantém JWT próprio mas opera como tenant)
-- Padrão consistente com security_incidents.platform_admin_all_incidents

CREATE POLICY "platform_admin_all_indicacao_campanhas"
  ON public.indicacao_campanhas
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.system_role = 'platform_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.system_role = 'platform_admin'
    )
  );

CREATE POLICY "platform_admin_all_cobranca_configs"
  ON public.cobranca_configs
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.system_role = 'platform_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.system_role = 'platform_admin'
    )
  );
;
