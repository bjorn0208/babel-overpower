
DROP POLICY IF EXISTS "user_read_own_channel" ON public.canais;
DROP POLICY IF EXISTS "user_update_own_channel" ON public.canais;
DROP POLICY IF EXISTS "user_insert_own_channel" ON public.canais;
-- 'admin_all_channels' (cmd ALL, eh platform_admin) já existe e é mantida.

-- Garantir que admin tem acesso total (recriar idempotente)
DROP POLICY IF EXISTS "admin_all_channels" ON public.canais;
CREATE POLICY "admin_all_channels" ON public.canais
FOR ALL TO authenticated
USING (eh_admin_plataforma())
WITH CHECK (eh_admin_plataforma());

;
