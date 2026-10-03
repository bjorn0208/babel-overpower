
ALTER TABLE leads ADD COLUMN IF NOT EXISTS client_stage text DEFAULT NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS converted_at timestamptz DEFAULT NULL;

COMMENT ON COLUMN leads.client_stage IS 'Estagio pos-venda: documentacao, protocolo, andamento, concluido';
COMMENT ON COLUMN leads.converted_at IS 'Data em que o lead foi convertido em cliente';

;
