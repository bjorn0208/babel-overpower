-- Evolui movimentos_financeiros (0 linhas, esqueleto nunca ligado) pro assistente financeiro.
ALTER TABLE public.movimentos_financeiros
  ADD COLUMN IF NOT EXISTS data_movimento date,
  ADD COLUMN IF NOT EXISTS categoria text,
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS documento_id uuid REFERENCES public.documentos_financeiros(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS atualizado_em timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'movimentos_financeiros_tipo_check') THEN
    ALTER TABLE public.movimentos_financeiros
      ADD CONSTRAINT movimentos_financeiros_tipo_check CHECK (tipo IN ('entrada','saida'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'movimentos_financeiros_origem_check') THEN
    ALTER TABLE public.movimentos_financeiros
      ADD CONSTRAINT movimentos_financeiros_origem_check CHECK (origem IN ('manual','agente_wpp','comprovante','extrato'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'movimentos_financeiros_valor_check') THEN
    ALTER TABLE public.movimentos_financeiros
      ADD CONSTRAINT movimentos_financeiros_valor_check CHECK (valor > 0);
  END IF;
END $$;

COMMENT ON COLUMN public.movimentos_financeiros.data_movimento IS 'Data real do gasto/recebimento (extraída do documento), distinta de criado_em.';
COMMENT ON COLUMN public.movimentos_financeiros.origem IS 'manual (app) · agente_wpp (texto na conversa) · comprovante · extrato.';

CREATE INDEX IF NOT EXISTS idx_movimentos_financeiros_owner_data
  ON public.movimentos_financeiros (owner_id, data_movimento DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_movimentos_financeiros_documento
  ON public.movimentos_financeiros (documento_id) WHERE documento_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_movimentos_financeiros_lead
  ON public.movimentos_financeiros (lead_id) WHERE lead_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_movimentos_financeiros_atualizado ON public.movimentos_financeiros;
CREATE TRIGGER trg_movimentos_financeiros_atualizado
  BEFORE UPDATE ON public.movimentos_financeiros
  FOR EACH ROW EXECUTE FUNCTION public.set_atualizado_em();
;
