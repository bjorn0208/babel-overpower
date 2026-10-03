
-- knowledge_chunks ganha escopo (global|nicho|tenant) + nicho_id + constraint + RLS ajustada.
-- Rows existentes (484) viram escopo='tenant' via DEFAULT, preservando comportamento atual.
-- agent_id continua obrigatorio pra escopo='tenant', mas fica NULL pra global/nicho.

-- 1) Torna agent_id nullable (necessario pra escopo global/nicho)
ALTER TABLE public.knowledge_chunks ALTER COLUMN agent_id DROP NOT NULL;

-- 2) Adiciona colunas
ALTER TABLE public.knowledge_chunks 
  ADD COLUMN IF NOT EXISTS escopo text NOT NULL DEFAULT 'tenant';

ALTER TABLE public.knowledge_chunks 
  ADD COLUMN IF NOT EXISTS nicho_id uuid REFERENCES public.nichos(id) ON DELETE CASCADE;

-- 3) CHECK escopo valido
ALTER TABLE public.knowledge_chunks 
  DROP CONSTRAINT IF EXISTS knowledge_chunks_escopo_check;
ALTER TABLE public.knowledge_chunks 
  ADD CONSTRAINT knowledge_chunks_escopo_check 
  CHECK (escopo IN ('global','nicho','tenant'));

-- 4) CHECK consistencia
ALTER TABLE public.knowledge_chunks 
  DROP CONSTRAINT IF EXISTS knowledge_chunks_escopo_consistente;
ALTER TABLE public.knowledge_chunks 
  ADD CONSTRAINT knowledge_chunks_escopo_consistente CHECK (
    (escopo = 'global'  AND nicho_id IS NULL     AND agent_id IS NULL)
    OR (escopo = 'nicho' AND nicho_id IS NOT NULL AND agent_id IS NULL)
    OR (escopo = 'tenant' AND agent_id IS NOT NULL)
  );

-- 5) Indexes
CREATE INDEX IF NOT EXISTS knowledge_chunks_escopo_idx ON public.knowledge_chunks (escopo);
CREATE INDEX IF NOT EXISTS knowledge_chunks_nicho_id_idx ON public.knowledge_chunks (nicho_id) WHERE nicho_id IS NOT NULL;

-- 6) RLS ajustada: leitura por escopo cascata
DROP POLICY IF EXISTS "user_read_own_chunks" ON public.knowledge_chunks;
CREATE POLICY "user_read_own_chunks" ON public.knowledge_chunks
  FOR SELECT TO authenticated USING (
    ativo = true AND (
      escopo = 'global'
      OR (escopo = 'nicho' AND nicho_id = (SELECT nicho_id FROM public.profiles WHERE id = (SELECT auth.uid())))
      OR (escopo = 'tenant' AND agent_id IN (
            SELECT ua.id FROM public.user_agents ua WHERE ua.user_id = (SELECT auth.uid())
          ))
    )
  );

-- admin_read_knowledge_chunks e srv_knowledge_chunks preservadas (nao tocadas)

;
