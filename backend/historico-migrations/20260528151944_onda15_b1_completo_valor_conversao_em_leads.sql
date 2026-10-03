-- ============================================================================
-- Onda 15.2 — B1 completo: valor_conversao em leads (motivo_perda já mapeado como desfecho_motivo)
-- ============================================================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS valor_conversao numeric(12,2);

COMMENT ON COLUMN public.leads.valor_conversao IS
'Valor financeiro da conversão (R$). Populado quando desfecho=convertido (via tool marcar_contrato_assinado ou UI manual em /atendimento).';

-- Index no funil (desfecho + valor)
CREATE INDEX IF NOT EXISTS idx_leads_valor_conversao_periodo
  ON public.leads(tenant_id, desfecho_em DESC)
  WHERE deleted_at IS NULL AND valor_conversao IS NOT NULL;

;
