
-- contratos_template: toggle ativo + config pagamento
ALTER TABLE contratos_template
  ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pix_key text,
  ADD COLUMN IF NOT EXISTS installment_link text,
  ADD COLUMN IF NOT EXISTS payment_position text CHECK (payment_position IS NULL OR payment_position IN ('before_sign', 'after_sign'));

-- contracts: campo origem (agente vs manual)
ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'manual' CHECK (origem IN ('agente', 'manual'));

-- Marcar contratos_template existentes com conteudo como ativos
UPDATE contratos_template SET ativo = true WHERE conteudo IS NOT NULL AND conteudo != '';

;
