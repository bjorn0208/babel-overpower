-- Policies pra tenant criar/editar/deletar suas próprias ferramentas dinâmicas
-- (escopo='tenant' AND tenant_id = auth.uid()). Globais continuam só pra super admin.

DROP POLICY IF EXISTS "ferramentas_tenant_insert" ON public.ferramentas_dinamicas;
CREATE POLICY "ferramentas_tenant_insert" ON public.ferramentas_dinamicas
  FOR INSERT TO authenticated
  WITH CHECK (escopo = 'tenant'::escopo_ragentic AND tenant_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "ferramentas_tenant_update" ON public.ferramentas_dinamicas;
CREATE POLICY "ferramentas_tenant_update" ON public.ferramentas_dinamicas
  FOR UPDATE TO authenticated
  USING (escopo = 'tenant'::escopo_ragentic AND tenant_id = (SELECT auth.uid()))
  WITH CHECK (escopo = 'tenant'::escopo_ragentic AND tenant_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "ferramentas_tenant_delete" ON public.ferramentas_dinamicas;
CREATE POLICY "ferramentas_tenant_delete" ON public.ferramentas_dinamicas
  FOR DELETE TO authenticated
  USING (escopo = 'tenant'::escopo_ragentic AND tenant_id = (SELECT auth.uid()));

COMMENT ON POLICY "ferramentas_tenant_insert" ON public.ferramentas_dinamicas IS
  'Tenant cria suas próprias tools dinâmicas. Escopo travado em tenant + tenant_id obrigatório igual ao auth.uid().';
;
