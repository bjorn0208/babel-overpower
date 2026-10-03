-- Onda 1 do redesign Curadoria v2 (2026-05-04).
-- Aperta CHECK de meta_chunks.tag pra 5 valores cravados, alinhando UI ↔ schema ↔ runtime.

-- 1. Migrar único chunk órfão `espelhamento_sutil` antes do CHECK apertar.
UPDATE public.meta_chunks
SET tag = 'planejar_turno',
    ativo = false,
    updated_at = now()
WHERE tag = 'espelhamento_sutil';

-- 2. Apertar CHECK constraint pra 5 valores canônicos.
ALTER TABLE public.meta_chunks
  DROP CONSTRAINT IF EXISTS meta_chunks_tag_check;

ALTER TABLE public.meta_chunks
  ADD CONSTRAINT meta_chunks_tag_check
  CHECK (tag IN (
    'planejar_turno',
    'verificar_saida',
    'escolher_ferramenta',
    'antecipar_objecao',
    'reflexao_runtime'
  ));

-- 3. Cravar semântica das 5 tags como documentação de schema.
COMMENT ON COLUMN public.meta_chunks.tag IS
  '5 tags canônicas (2026-05-04): planejar_turno (estratégia turno consultada por planejador.ts), verificar_saida (sanity check pós-LLM consultado por verificador.ts), escolher_ferramenta (sugestão de tool com regex `Use X quando` lido por planejador.ts), antecipar_objecao (A3 Predictive consultado por planejador.ts), reflexao_runtime (auto-criado por edge reflexao-runtime — nasce ativo=false, espera curador aprovar via aba aprend/reflexao-aprovar).';
;
