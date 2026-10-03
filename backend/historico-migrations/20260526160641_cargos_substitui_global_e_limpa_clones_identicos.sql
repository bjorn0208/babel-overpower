-- ============================================================================
-- Fix duplicação de cargos no app Agente
-- Snapshot de backup + coluna substitui_global_id + UPDATE divergentes
-- + REPOINT de conversas + DELETE 64 clones idênticos + policy nicho
-- ============================================================================

-- 1. SNAPSHOT antes de qualquer mudança (rollback rápido se precisar)
CREATE TABLE IF NOT EXISTS public.cargos_backup_2026_05_26 AS
SELECT * FROM public.cargos;

CREATE TABLE IF NOT EXISTS public.cargo_ferramentas_backup_2026_05_26 AS
SELECT * FROM public.cargo_ferramentas;

-- 2. ADD COLUMN — clone do tenant que substitui um global na UI
ALTER TABLE public.cargos
  ADD COLUMN IF NOT EXISTS substitui_global_id uuid
    REFERENCES public.cargos(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.cargos.substitui_global_id IS
  'Quando preenchido, esconde o cargo global apontado na lista deste tenant. Usado pra cargos do tenant que personalizam um global homônimo.';

CREATE INDEX IF NOT EXISTS idx_cargos_substitui_global
  ON public.cargos(substitui_global_id)
  WHERE substitui_global_id IS NOT NULL;

-- 3. UPDATE divergentes — marca como substitutos do global homônimo
WITH globais AS (
  SELECT id AS global_id, nome
  FROM public.cargos
  WHERE escopo = 'global'
)
UPDATE public.cargos t
SET substitui_global_id = g.global_id
FROM globais g, public.cargos gc
WHERE t.escopo = 'tenant'
  AND gc.id = g.global_id
  AND gc.nome = t.nome
  AND NOT (
    t.objetivo_principal IS NOT DISTINCT FROM gc.objetivo_principal
    AND t.regras_livres IS NOT DISTINCT FROM gc.regras_livres
    AND t.campos_rastreio::text IS NOT DISTINCT FROM gc.campos_rastreio::text
    AND t.tipologia IS NOT DISTINCT FROM gc.tipologia
    AND t.canal_atuacao IS NOT DISTINCT FROM gc.canal_atuacao
  );

-- 4. REPOINT conversas vivas (3 do João Pedro) ANTES de deletar os idênticos
WITH globais AS (
  SELECT id AS global_id, nome
  FROM public.cargos
  WHERE escopo = 'global'
),
identicos AS (
  SELECT t.id AS clone_id, g.global_id
  FROM public.cargos t
  JOIN globais g ON g.nome = t.nome
  JOIN public.cargos gc ON gc.id = g.global_id
  WHERE t.escopo = 'tenant'
    AND t.objetivo_principal IS NOT DISTINCT FROM gc.objetivo_principal
    AND t.regras_livres IS NOT DISTINCT FROM gc.regras_livres
    AND t.campos_rastreio::text IS NOT DISTINCT FROM gc.campos_rastreio::text
    AND t.tipologia IS NOT DISTINCT FROM gc.tipologia
    AND t.canal_atuacao IS NOT DISTINCT FROM gc.canal_atuacao
)
UPDATE public.conversas conv
SET cargo_ativo_id = i.global_id
FROM identicos i
WHERE conv.cargo_ativo_id = i.clone_id;

-- 5. DELETE 64 clones idênticos (CASCADE limpa cargo_ferramentas, cargo_diretrizes, cargo_tarefas)
WITH globais AS (
  SELECT id AS global_id, nome
  FROM public.cargos
  WHERE escopo = 'global'
),
identicos AS (
  SELECT t.id
  FROM public.cargos t
  JOIN globais g ON g.nome = t.nome
  JOIN public.cargos gc ON gc.id = g.global_id
  WHERE t.escopo = 'tenant'
    AND t.objetivo_principal IS NOT DISTINCT FROM gc.objetivo_principal
    AND t.regras_livres IS NOT DISTINCT FROM gc.regras_livres
    AND t.campos_rastreio::text IS NOT DISTINCT FROM gc.campos_rastreio::text
    AND t.tipologia IS NOT DISTINCT FROM gc.tipologia
    AND t.canal_atuacao IS NOT DISTINCT FROM gc.canal_atuacao
)
DELETE FROM public.cargos WHERE id IN (SELECT id FROM identicos);

-- 6. CREATE POLICY cargos_ver_nicho — habilita SELECT em cargos do nicho do tenant
DROP POLICY IF EXISTS cargos_ver_nicho ON public.cargos;
CREATE POLICY cargos_ver_nicho ON public.cargos
  FOR SELECT
  TO authenticated
  USING (
    escopo = 'nicho'
    AND nicho_id = (
      SELECT p.nicho_id FROM public.profiles p
      WHERE p.id = (select auth.uid())
    )
  );

COMMENT ON POLICY cargos_ver_nicho ON public.cargos IS
  'Tenant pode SELECT cargos do nicho associado ao seu profile (escopo=nicho).';
;
