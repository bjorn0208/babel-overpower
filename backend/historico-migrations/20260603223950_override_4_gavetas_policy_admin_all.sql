-- Alinha as 4 tabelas novas ao padrão completo das gavetas de conteúdo:
-- admin de plataforma (curadoria) enxerga os overrides de todos os tenants.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'overrides_tenant_blocos_procedurais',
    'overrides_tenant_blocos_emocao',
    'overrides_tenant_blocos_prova_social',
    'overrides_tenant_blocos_anti_padroes'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS admin_all ON public.%I;', t);
    EXECUTE format($f$
      CREATE POLICY admin_all ON public.%I
        FOR ALL TO authenticated
        USING (EXISTS (SELECT 1 FROM public.profiles pr
                       WHERE pr.id = (select auth.uid()) AND pr.system_role = 'platform_admin'))
        WITH CHECK (EXISTS (SELECT 1 FROM public.profiles pr
                       WHERE pr.id = (select auth.uid()) AND pr.system_role = 'platform_admin'));
    $f$, t);
  END LOOP;
END $$;
;
