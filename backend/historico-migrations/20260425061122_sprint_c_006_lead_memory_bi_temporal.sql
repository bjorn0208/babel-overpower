
-- Sprint C · Migration 006 · lead_memory bi-temporal
-- Adiciona 3 cols pra distinguir verdade do sistema vs verdade do mundo real

ALTER TABLE public.lead_memory
  ADD COLUMN IF NOT EXISTS system_expired_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS real_world_valid_from timestamptz NULL,
  ADD COLUMN IF NOT EXISTS real_world_valid_to timestamptz NULL;

COMMENT ON COLUMN public.lead_memory.system_expired_at IS 'Quando o sistema marcou esse fato como expirado/superseded por chunk mais recente. NULL = ainda vivo no sistema.';
COMMENT ON COLUMN public.lead_memory.real_world_valid_from IS 'Início da validade desse fato no mundo real (pode ser passada). NULL = não rastreado.';
COMMENT ON COLUMN public.lead_memory.real_world_valid_to IS 'Fim da validade desse fato no mundo real. NULL = ainda vale.';

-- Índice parcial pra busca de fatos vivos por lead (caso mais comum)
CREATE INDEX IF NOT EXISTS idx_lead_memory_vivos_por_lead
  ON public.lead_memory (tenant_id, lead_id)
  WHERE system_expired_at IS NULL AND ativa = true;

;
