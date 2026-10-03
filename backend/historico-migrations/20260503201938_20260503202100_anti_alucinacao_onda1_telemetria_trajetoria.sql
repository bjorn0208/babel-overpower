-- DEC-032 · trajectory KPI — telemetria de trajetória em message_prompts
-- Anti-alucinação Onda 1 (2026-05-03)
-- Risco: baixo (3 colunas nullable; DDL não-bloqueante)
-- DDL puro — zero impacto nas 20.979 linhas existentes

ALTER TABLE public.message_prompts
  ADD COLUMN IF NOT EXISTS intent_gemma_raw text,
  ADD COLUMN IF NOT EXISTS verifier_pass_count integer,
  ADD COLUMN IF NOT EXISTS retrieval_waves integer;

-- Comentários de autodocumentação (pt-BR)
COMMENT ON COLUMN public.message_prompts.intent_gemma_raw IS 'Intent literal devolvido pelo Gemma (DEC-032) ANTES do mapeamento classificarTurno; usado pra medir drift';
COMMENT ON COLUMN public.message_prompts.verifier_pass_count IS '1 = ok no primeiro Flash; 2 = rodou retry condicional (DEC-031)';
COMMENT ON COLUMN public.message_prompts.retrieval_waves IS '1 = retrieval normal; 2 = re-retrieval no retry condicional (DEC-031)';

-- RLS: message_prompts já tem RLS habilitado. Colunas novas herdam as policies
-- existentes implicitamente (policies não são column-specific). Sem ação adicional.
;
