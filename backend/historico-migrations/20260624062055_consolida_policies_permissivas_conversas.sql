-- Consolida policies permissivas de conversas (advisor multiple_permissive_policies).
-- Semântica preservada: cada comando vira 1 policy com OR de TODAS as condições das
-- policies originais. eh_admin_plataforma() (STABLE SECURITY DEFINER) envolvida em
-- (select ...) para avaliar 1x por query (initplan), igual ao (select auth.uid()).
-- Isolamento validado por teste de role (baseline A=5553/0, B=537/0, anon=0).
-- service_role (srv_conversations) e INSERT (user_insert_own_conversations) intactos.

-- SELECT: admin_read + user_read (chat-test) + user_read_tenant  ->  1
DROP POLICY IF EXISTS admin_read_conversations ON public.conversas;
DROP POLICY IF EXISTS user_read_conversations ON public.conversas;
DROP POLICY IF EXISTS user_read_tenant_conversations ON public.conversas;
CREATE POLICY conv_select ON public.conversas FOR SELECT TO authenticated
USING (
  (select public.eh_admin_plataforma())
  OR (tenant_id = (select auth.uid()))
  OR (tenant_id IN (SELECT p.parent_user_id FROM public.profiles p WHERE p.id = (select auth.uid()) AND p.parent_user_id IS NOT NULL))
  OR ((phone ~~ 'chat-test-%') AND EXISTS (
    SELECT 1 FROM public.agentes ua
    WHERE conversas.phone ~~ ('chat-test-' || ua.id || '%')
      AND (ua.user_id = (select auth.uid())
           OR EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.id = (select auth.uid()) AND p2.parent_user_id = ua.user_id))
  ))
);

-- UPDATE: admin_update + user_update  ->  1
DROP POLICY IF EXISTS admin_update_conversations ON public.conversas;
DROP POLICY IF EXISTS user_update_own_conversations ON public.conversas;
CREATE POLICY conv_update ON public.conversas FOR UPDATE TO authenticated
USING (
  (select public.eh_admin_plataforma())
  OR (tenant_id = (select auth.uid()))
  OR (tenant_id IN (SELECT p.parent_user_id FROM public.profiles p WHERE p.id = (select auth.uid()) AND p.parent_user_id IS NOT NULL))
)
WITH CHECK (
  (select public.eh_admin_plataforma())
  OR (tenant_id = (select auth.uid()))
  OR (tenant_id IN (SELECT p.parent_user_id FROM public.profiles p WHERE p.id = (select auth.uid()) AND p.parent_user_id IS NOT NULL))
);

-- DELETE: admin_excluir + user_delete  ->  1
DROP POLICY IF EXISTS admin_excluir_conversas ON public.conversas;
DROP POLICY IF EXISTS user_delete_own_conversations ON public.conversas;
CREATE POLICY conv_delete ON public.conversas FOR DELETE TO authenticated
USING (
  (select public.eh_admin_plataforma())
  OR (tenant_id = (select auth.uid()))
  OR (tenant_id IN (SELECT p.parent_user_id FROM public.profiles p WHERE p.id = (select auth.uid()) AND p.parent_user_id IS NOT NULL))
);
;
