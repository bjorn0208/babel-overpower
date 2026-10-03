-- Expande whitelist de meta_chunks.tag pra incluir 'antecipar_objecao' (A3 Predictive) e 'reflexao_runtime' (A2 Reflexion)
ALTER TABLE public.meta_chunks
  DROP CONSTRAINT IF EXISTS meta_chunks_tag_check;

ALTER TABLE public.meta_chunks
  ADD CONSTRAINT meta_chunks_tag_check
  CHECK (tag = ANY (ARRAY[
    'planejar_turno'::text,
    'verificar_saida'::text,
    'escolher_ferramenta'::text,
    'espelhamento_sutil'::text,
    'antecipar_objecao'::text,
    'reflexao_runtime'::text,
    'corrigir_drift'::text,
    'procedimento'::text
  ]));

COMMENT ON CONSTRAINT meta_chunks_tag_check ON public.meta_chunks IS
  'Whitelist de tags de meta_chunks. Cobre Camada 1 (planejar/escolher/antecipar), Camada 3 (verificar), Ajuste 4 (espelhamento), A2 Reflexion (reflexao_runtime), A6 drift (corrigir_drift), B10 procedural (procedimento).';
;
