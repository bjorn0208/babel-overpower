ALTER TABLE purchase_orders DROP CONSTRAINT purchase_orders_tipo_check;
ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_tipo_check CHECK (tipo = ANY (ARRAY['plano'::text, 'pacote_extra'::text, 'plus'::text, 'implantacao'::text]));
;
