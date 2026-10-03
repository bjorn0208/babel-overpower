-- Corrige ordem: drop constraint antes do UPDATE, senao CHECK antigo bloqueia 'global'
ALTER TABLE trigger_chunks DROP CONSTRAINT IF EXISTS trigger_chunks_escopo_check;

UPDATE trigger_chunks SET escopo = 'global' WHERE escopo = 'universal';

ALTER TABLE trigger_chunks
  ADD CONSTRAINT trigger_chunks_escopo_check
  CHECK (escopo IS NULL OR escopo IN ('global','nicho','tenant','produto'));
;
