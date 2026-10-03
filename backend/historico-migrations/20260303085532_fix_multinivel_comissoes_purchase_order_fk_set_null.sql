
-- Fix: multinivel_comissoes.purchase_order_id → purchase_orders bloqueia delete de usuarios
-- Trocar NO ACTION por SET NULL
ALTER TABLE public.multinivel_comissoes
  DROP CONSTRAINT IF EXISTS multinivel_comissoes_purchase_order_id_fkey;

ALTER TABLE public.multinivel_comissoes
  ADD CONSTRAINT multinivel_comissoes_purchase_order_id_fkey
  FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(id)
  ON DELETE SET NULL;

;
