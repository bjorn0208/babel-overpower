-- ============================================================
-- UP: Consolidar 8 policies RLS de lead_memory em 5
-- Onda 0 pré-Rodada 01 | 2026-04-20
-- ============================================================
-- DOWN (recriar as 3 políticas removidas):
--   CREATE POLICY "service_role_all_memory" ON public.lead_memory
--     FOR ALL TO service_role USING (true) WITH CHECK (true);
--   CREATE POLICY "tenant_read_memory" ON public.lead_memory
--     FOR SELECT TO authenticated
--     USING (tenant_id = (SELECT auth.uid()));
--   CREATE POLICY "tenant_write_memory" ON public.lead_memory
--     FOR ALL TO authenticated
--     USING (tenant_id = (SELECT auth.uid()))
--     WITH CHECK (tenant_id = (SELECT auth.uid()));

-- Remover duplicata de service_role
DROP POLICY IF EXISTS "service_role_all_memory" ON public.lead_memory;

-- Remover policies simples que conflitam com as granulares mais completas
DROP POLICY IF EXISTS "tenant_read_memory" ON public.lead_memory;
DROP POLICY IF EXISTS "tenant_write_memory" ON public.lead_memory;

-- As 5 políticas mantidas (já existem, apenas documentado aqui para clareza):
-- 1. lead_memory_service_role  — ALL TO service_role
-- 2. lead_memory_tenant_select — SELECT TO authenticated (tenant + team member + platform_admin)
-- 3. lead_memory_tenant_insert — INSERT TO authenticated (tenant + team member + platform_admin)
-- 4. lead_memory_tenant_update — UPDATE TO authenticated (tenant + team member + platform_admin)
-- 5. lead_memory_tenant_delete — DELETE TO authenticated (tenant + team member + platform_admin)

;
