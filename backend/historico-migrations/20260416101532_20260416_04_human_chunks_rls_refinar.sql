DROP POLICY IF EXISTS auth_read_human ON human_chunks;

CREATE POLICY tenant_read_human_chunks ON human_chunks
  FOR SELECT TO authenticated
  USING (
    ativo = true AND (
      escopo = 'global'
      OR (escopo = 'nicho' AND nicho_id = (SELECT nicho_id FROM profiles WHERE id = (SELECT auth.uid())))
      OR (escopo IN ('tenant','produto') AND tenant_id = (SELECT auth.uid()))
    )
  );

DROP POLICY IF EXISTS tenant_write_human_chunks ON human_chunks;
CREATE POLICY tenant_write_human_chunks ON human_chunks
  FOR ALL TO authenticated
  USING (
    escopo IN ('tenant','produto') AND tenant_id = (SELECT auth.uid())
  )
  WITH CHECK (
    escopo IN ('tenant','produto') AND tenant_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS admin_all_human_chunks ON human_chunks;
CREATE POLICY admin_all_human_chunks ON human_chunks
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = (SELECT auth.uid()) AND system_role = 'platform_admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = (SELECT auth.uid()) AND system_role = 'platform_admin')
  );
;
