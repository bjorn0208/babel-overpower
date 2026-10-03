ALTER TABLE contratos_template
ADD COLUMN IF NOT EXISTS installment_options JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN contratos_template.installment_options IS 'Array de opções de parcelamento: [{entrada, parcelas, valor_parcela, link?}]';
;
