-- Alinha CHECK com schema Zod do extract-lead-facts
-- Zod: fato_biografico | fato_financeiro | objecao | interesse | historico_negociacao
-- Antigo CHECK: demografico | familia | financeiro | trabalho | saude | interesse | objecao | historico_relacionamento | outro
-- lead_memory está vazia (0 rows) — sem risco de quebrar dado existente.

ALTER TABLE public.lead_memory
  DROP CONSTRAINT IF EXISTS lead_memory_categoria_check;

ALTER TABLE public.lead_memory
  ADD CONSTRAINT lead_memory_categoria_check
  CHECK (categoria = ANY (ARRAY[
    'fato_biografico'::text,
    'fato_financeiro'::text,
    'objecao'::text,
    'interesse'::text,
    'historico_negociacao'::text
  ]));

COMMENT ON CONSTRAINT lead_memory_categoria_check ON public.lead_memory IS
  'Alinhado com ExtractLeadFactsOutputSchema.CategoriasLeadMemory em supabase/functions/extract-lead-facts/schema.ts';
;
