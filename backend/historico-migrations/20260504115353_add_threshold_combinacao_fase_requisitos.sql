-- Onda 2 redesign-fluxo-fase-rag-first
-- Aditivo: 2 colunas opcionais com defaults conservadores que preservam comportamento legado.
ALTER TABLE public.fase_requisitos
  ADD COLUMN IF NOT EXISTS threshold double precision DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS combinacao_evidencias text DEFAULT 'max'
    CHECK (combinacao_evidencias IN ('max','mean','rrf'));

COMMENT ON COLUMN public.fase_requisitos.threshold IS
  'Score mínimo (0.0-1.0) pra requisito ser considerado cumprido. Default 0.5 conservador. Curador pode override por requisito. Onda 2 redesign-fluxo-fase-rag-first.';
COMMENT ON COLUMN public.fase_requisitos.combinacao_evidencias IS
  'Como combinar scores das evidências em OR. max=primeira melhor, mean=média ponderada (futuro), rrf=fusão recíproca (futuro). Default max (KISS v1). Onda 2.';
;
