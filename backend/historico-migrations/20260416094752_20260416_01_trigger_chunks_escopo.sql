-- T1 Curadoria: padroniza modelo de escopo em trigger_chunks
-- Estado atual: coluna 'escopo' existe com CHECK antigo ('global','nicho','tenant'), sem categoria/subcategoria.
-- Meta: CHECK novo ('universal','nicho','tenant','produto'), colunas categoria/subcategoria, backfill.

-- 1. Drop CHECK antigo (valores legados 'global' em vez de 'universal')
ALTER TABLE trigger_chunks
  DROP CONSTRAINT IF EXISTS trigger_chunks_escopo_check;

-- 2. Colunas novas (categoria/subcategoria)
ALTER TABLE trigger_chunks
  ADD COLUMN IF NOT EXISTS categoria text,
  ADD COLUMN IF NOT EXISTS subcategoria text;

-- 3. Backfill 'global' -> 'universal' (padrao novo)
UPDATE trigger_chunks
SET escopo = 'universal'
WHERE escopo = 'global';

-- 4. Backfill de eventuais NULLs (regra do plano)
UPDATE trigger_chunks
SET escopo = CASE
  WHEN tenant_id IS NOT NULL THEN 'tenant'
  WHEN nicho_id IS NOT NULL THEN 'nicho'
  ELSE 'universal'
END
WHERE escopo IS NULL;

-- 5. CHECK novo alinhado com behavior_chunks
ALTER TABLE trigger_chunks
  ADD CONSTRAINT trigger_chunks_escopo_check
  CHECK (escopo IS NULL OR escopo IN ('universal','nicho','tenant','produto'));

-- 6. Indices para filtros do painel de curadoria
CREATE INDEX IF NOT EXISTS trigger_chunks_escopo_nicho_idx ON trigger_chunks(escopo, nicho_id);
CREATE INDEX IF NOT EXISTS trigger_chunks_categoria_idx ON trigger_chunks(categoria, subcategoria);
;
