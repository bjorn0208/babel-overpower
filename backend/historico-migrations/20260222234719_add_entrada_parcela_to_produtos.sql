ALTER TABLE produtos
  ADD COLUMN IF NOT EXISTS valor_entrada numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS num_parcelas integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_parcela numeric DEFAULT 0;
;
