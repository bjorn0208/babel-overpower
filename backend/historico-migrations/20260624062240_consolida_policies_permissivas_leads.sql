-- Consolida policies permissivas de leads (PII — isolamento crítico). Mesmo padrão
-- de conversas: 1 policy por comando com OR de todas as condições. eh_admin em (select).
-- Baseline validado: A=5513/0, B=535/0, anon=0. srv_leads + user_insert_own_leads intactos.

-- SELECT: admin_read + user_read -> 1
DROP POLICY IF EXISTS admin_read_leads ON public.leads;
DROP POLICY IF EXISTS user_read_own_leads ON public.leads;
CREATE POLICY leads_select ON public.leads FOR SELECT TO authenticated
USING (
  (select public.eh_admin_plataforma())
  OR (tenant_id = (select auth.uid()))
  OR (tenant_id IN (SELECT p.parent_user_id FROM public.profiles p WHERE p.id = (select auth.uid()) AND p.parent_user_id IS NOT NULL))
);

-- UPDATE: admin_update + user_update -> 1
DROP POLICY IF EXISTS admin_update_leads ON public.leads;
DROP POLICY IF EXISTS user_update_own_leads ON public.leads;
CREATE POLICY leads_update ON public.leads FOR UPDATE TO authenticated
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

-- DELETE: admin_excluir + user_delete -> 1
DROP POLICY IF EXISTS admin_excluir_leads ON public.leads;
DROP POLICY IF EXISTS user_delete_own_leads ON public.leads;
CREATE POLICY leads_delete ON public.leads FOR DELETE TO authenticated
USING (
  (select public.eh_admin_plataforma())
  OR (tenant_id = (select auth.uid()))
  OR (tenant_id IN (SELECT p.parent_user_id FROM public.profiles p WHERE p.id = (select auth.uid()) AND p.parent_user_id IS NOT NULL))
);
;
