
ALTER TABLE public.meta_chunks DROP CONSTRAINT IF EXISTS meta_chunks_tag_check;
ALTER TABLE public.meta_chunks ADD CONSTRAINT meta_chunks_tag_check
  CHECK (tag = ANY (ARRAY['planejar_turno','verificar_saida','escolher_ferramenta','espelhamento_sutil']));

;
