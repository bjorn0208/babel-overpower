-- T5: variation_chunks — categoria/subcategoria/prioridade + policies tenant_write e admin_all
-- Amplia CHECK do escopo para incluir 'produto'

ALTER TABLE variation_chunks
  ADD COLUMN IF NOT EXISTS categoria text,
  ADD COLUMN IF NOT EXISTS subcategoria text,
  ADD COLUMN IF NOT EXISTS prioridade int DEFAULT 500;

CREATE INDEX IF NOT EXISTS variation_chunks_categoria_idx ON variation_chunks(categoria, subcategoria);

-- Ampliar CHECK escopo (adicionar 'produto')
ALTER TABLE variation_chunks DROP CONSTRAINT IF EXISTS variation_chunks_escopo_check;
ALTER TABLE variation_chunks ADD CONSTRAINT variation_chunks_escopo_check
  CHECK (escopo = ANY (ARRAY['global'::text, 'nicho'::text, 'tenant'::text, 'produto'::text]));

-- Ampliar CHECK consistência (produto: tenant_id obrigatório, nicho_id opcional)
ALTER TABLE variation_chunks DROP CONSTRAINT IF EXISTS variation_chunks_escopo_consistente;
ALTER TABLE variation_chunks ADD CONSTRAINT variation_chunks_escopo_consistente
  CHECK (
    ((escopo = 'global'::text) AND (nicho_id IS NULL) AND (tenant_id IS NULL))
    OR ((escopo = 'nicho'::text) AND (nicho_id IS NOT NULL) AND (tenant_id IS NULL))
    OR ((escopo = 'tenant'::text) AND (tenant_id IS NOT NULL))
    OR ((escopo = 'produto'::text) AND (tenant_id IS NOT NULL))
  );

-- Policy tenant_write_variation_chunks
DROP POLICY IF EXISTS tenant_write_variation_chunks ON variation_chunks;
CREATE POLICY tenant_write_variation_chunks ON variation_chunks
  FOR ALL TO authenticated
  USING (
    escopo IN ('tenant','produto') AND tenant_id = (SELECT auth.uid())
  )
  WITH CHECK (
    escopo IN ('tenant','produto') AND tenant_id = (SELECT auth.uid())
  );

-- Policy admin_all_variation_chunks
DROP POLICY IF EXISTS admin_all_variation_chunks ON variation_chunks;
CREATE POLICY admin_all_variation_chunks ON variation_chunks
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = (SELECT auth.uid()) AND system_role = 'platform_admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = (SELECT auth.uid()) AND system_role = 'platform_admin')
  );

;
