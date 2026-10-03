-- Migration: trigger_chunks_escopo_not_null
-- Remove a permissão de NULL no campo escopo de trigger_chunks
-- Pré-condição verificada: 0 rows com escopo IS NULL

-- Tornar escopo NOT NULL (a CHECK constraint já existe e valida os valores aceitos)
ALTER TABLE public.trigger_chunks
  ALTER COLUMN escopo SET NOT NULL;
;
