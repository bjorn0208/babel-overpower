
-- variation_chunks ganha escopo (global|nicho|tenant) + FKs + constraint consistencia + indexes + RLS nova.
-- Aditiva: DEFAULT 'global' preserva as 0 rows existentes (mas futuras linhas precisam especificar).

-- 1) Adiciona colunas
ALTER TABLE public.variation_chunks 
  ADD COLUMN IF NOT EXISTS escopo text NOT NULL DEFAULT 'global';

ALTER TABLE public.variation_chunks 
  ADD COLUMN IF NOT EXISTS nicho_id uuid REFERENCES public.nichos(id) ON DELETE CASCADE;

ALTER TABLE public.variation_chunks 
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 2) CHECK escopo valido
ALTER TABLE public.variation_chunks 
  DROP CONSTRAINT IF EXISTS variation_chunks_escopo_check;
ALTER TABLE public.variation_chunks 
  ADD CONSTRAINT variation_chunks_escopo_check 
  CHECK (escopo IN ('global','nicho','tenant'));

-- 3) CHECK consistencia (global: sem refs; nicho: nicho_id NOT NULL; tenant: tenant_id NOT NULL)
ALTER TABLE public.variation_chunks 
  DROP CONSTRAINT IF EXISTS variation_chunks_escopo_consistente;
ALTER TABLE public.variation_chunks 
  ADD CONSTRAINT variation_chunks_escopo_consistente CHECK (
    (escopo = 'global'  AND nicho_id IS NULL     AND tenant_id IS NULL)
    OR (escopo = 'nicho' AND nicho_id IS NOT NULL AND tenant_id IS NULL)
    OR (escopo = 'tenant' AND tenant_id IS NOT NULL)
  );

-- 4) Indexes
CREATE INDEX IF NOT EXISTS variation_chunks_escopo_idx ON public.variation_chunks (escopo);
CREATE INDEX IF NOT EXISTS variation_chunks_nicho_id_idx ON public.variation_chunks (nicho_id) WHERE nicho_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS variation_chunks_tenant_id_idx ON public.variation_chunks (tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS variation_chunks_ativo_idx ON public.variation_chunks (ativo);

-- 5) Adiciona embedding + embedding_status (faltavam pra usar RAG semantico)
ALTER TABLE public.variation_chunks 
  ADD COLUMN IF NOT EXISTS embedding halfvec(1536);
ALTER TABLE public.variation_chunks 
  ADD COLUMN IF NOT EXISTS embedding_status text NOT NULL DEFAULT 'pending';
ALTER TABLE public.variation_chunks 
  DROP CONSTRAINT IF EXISTS variation_chunks_embedding_status_check;
ALTER TABLE public.variation_chunks 
  ADD CONSTRAINT variation_chunks_embedding_status_check 
  CHECK (embedding_status IN ('pending','processing','ready','failed'));

CREATE INDEX IF NOT EXISTS variation_chunks_embedding_hnsw ON public.variation_chunks
  USING hnsw (embedding halfvec_cosine_ops) WITH (m = 16, ef_construction = 64)
  WHERE embedding IS NOT NULL;

CREATE INDEX IF NOT EXISTS variation_chunks_fts_idx ON public.variation_chunks
  USING gin (to_tsvector('portuguese', nome_variation || ' ' || instrucao));

-- 6) RLS nova: leitura por escopo cascata
DROP POLICY IF EXISTS "auth_read_variation" ON public.variation_chunks;
CREATE POLICY "auth_read_variation" ON public.variation_chunks
  FOR SELECT TO authenticated USING (
    ativo = true AND (
      escopo = 'global'
      OR (escopo = 'nicho' AND nicho_id = (SELECT nicho_id FROM public.profiles WHERE id = (SELECT auth.uid())))
      OR (escopo = 'tenant' AND tenant_id = (SELECT auth.uid()))
    )
  );

-- service_role_all_variation preservada (nao tocada)

;
