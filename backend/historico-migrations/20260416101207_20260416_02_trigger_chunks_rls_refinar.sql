-- 1) Substituir auth_read_triggers por policy filtrando por escopo (espelho de behavior_chunks)
DROP POLICY IF EXISTS auth_read_triggers ON trigger_chunks;

CREATE POLICY tenant_read_trigger_chunks ON trigger_chunks
  FOR SELECT TO authenticated
  USING (
    ativo = true AND (
      escopo = 'global'
      OR (escopo = 'nicho' AND nicho_id = (SELECT nicho_id FROM profiles WHERE id = (SELECT auth.uid())))
      OR (escopo IN ('tenant','produto') AND tenant_id = (SELECT auth.uid()))
    )
  );

-- 2) Policy de write para tenant (sobre os proprios)
DROP POLICY IF EXISTS tenant_write_trigger_chunks ON trigger_chunks;
CREATE POLICY tenant_write_trigger_chunks ON trigger_chunks
  FOR ALL TO authenticated
  USING (
    escopo IN ('tenant','produto') AND tenant_id = (SELECT auth.uid())
  )
  WITH CHECK (
    escopo IN ('tenant','produto') AND tenant_id = (SELECT auth.uid())
  );

-- 3) Policy de admin (system_role=platform_admin tem passe livre)
DROP POLICY IF EXISTS admin_all_trigger_chunks ON trigger_chunks;
CREATE POLICY admin_all_trigger_chunks ON trigger_chunks
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = (SELECT auth.uid()) AND system_role = 'platform_admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = (SELECT auth.uid()) AND system_role = 'platform_admin')
  );
;
