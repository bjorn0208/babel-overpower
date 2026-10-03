-- Colunas de pagamento no contrato
ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS payment_position text,
  ADD COLUMN IF NOT EXISTS pix_key text,
  ADD COLUMN IF NOT EXISTS installment_link text,
  ADD COLUMN IF NOT EXISTS payment_proof_url text;

-- Constraint para validar payment_position
ALTER TABLE contracts
  ADD CONSTRAINT contracts_payment_position_check
  CHECK (payment_position IS NULL OR payment_position IN ('before_sign', 'after_sign'));
;
