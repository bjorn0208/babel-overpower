-- Permite o platform_admin inserir pedido de compra para qualquer tenant
-- (ativação manual de plano que dispara a comissão multinível via trigger).
-- Hoje só existia INSERT para o próprio usuário (user_insert_own_orders).
DROP POLICY IF EXISTS "admin_insert_purchase_orders" ON public.pedidos_compra;
CREATE POLICY "admin_insert_purchase_orders" ON public.pedidos_compra
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (select auth.uid())
        AND profiles.system_role = 'platform_admin'
    )
  );
;
