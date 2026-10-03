ALTER TABLE public.meta_chunks
  ADD COLUMN IF NOT EXISTS stability_tier text NOT NULL DEFAULT 'experimental'
    CHECK (stability_tier IN ('experimental','promovido','canonico'));

ALTER TABLE public.meta_chunks
  ADD COLUMN IF NOT EXISTS superseded_by uuid REFERENCES public.meta_chunks(id) ON DELETE SET NULL;

ALTER TABLE public.meta_chunks
  DROP CONSTRAINT IF EXISTS meta_chunks_no_self_supersede;
ALTER TABLE public.meta_chunks
  ADD CONSTRAINT meta_chunks_no_self_supersede CHECK (superseded_by IS NULL OR superseded_by <> id);

CREATE INDEX IF NOT EXISTS meta_chunks_stability_canonico_idx
  ON public.meta_chunks (tag)
  WHERE stability_tier = 'canonico' AND ativo = true;

CREATE INDEX IF NOT EXISTS meta_chunks_superseded_by_idx
  ON public.meta_chunks (superseded_by)
  WHERE superseded_by IS NOT NULL;

COMMENT ON COLUMN public.meta_chunks.stability_tier IS
  'Maturidade do chunk. experimental (default no insert): chunk novo. promovido: >=5 leads usaram com resultado positivo. canonico: aprovado pra ser guard imutavel.';

COMMENT ON COLUMN public.meta_chunks.superseded_by IS
  'Aponta pro chunk que substitui este. Quando setado, este chunk deve ficar ativo=false (versionamento sem perder historico).';
;
