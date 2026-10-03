-- Canal financeiro: 1 conversa por número autorizado (contexto isolado por pessoa).
ALTER TABLE public.mentor_conversas
  ADD COLUMN IF NOT EXISTS numero_wpp text;
COMMENT ON COLUMN public.mentor_conversas.numero_wpp IS 'Número de WhatsApp da pessoa no canal financeiro (null em mentor/curadoria) — separa a conversa de cada número autorizado.';
CREATE INDEX IF NOT EXISTS idx_mentor_conversas_financeiro_numero
  ON public.mentor_conversas (owner_id, numero_wpp) WHERE canal = 'financeiro';
;
