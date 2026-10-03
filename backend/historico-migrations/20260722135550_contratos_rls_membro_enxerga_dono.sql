-- Fix pacote Marcos 2026-07-22: membro de equipe não enxergava contratos do dono.
-- O INSERT já tinha a cláusula membro→dono (tenant_id = parent_user_id do membro);
-- SELECT e UPDATE não — membro criava contrato e não conseguia ver (aba Contrato vazia).
-- Espelha a mesma cláusula nas duas policies. DELETE fica restrito a dono/admin (inalterado).

DROP POLICY IF EXISTS auth_select_own_contracts ON public.contratos;
CREATE POLICY auth_select_own_contracts ON public.contratos
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT auth.uid())
    OR tenant_id IN (SELECT p.id FROM public.profiles p WHERE p.parent_user_id = (SELECT auth.uid()))
    OR tenant_id = (SELECT p.parent_user_id FROM public.profiles p WHERE p.id = (SELECT auth.uid()))
    OR public.eh_admin_plataforma()
  );

DROP POLICY IF EXISTS auth_update_own_contracts ON public.contratos;
CREATE POLICY auth_update_own_contracts ON public.contratos
  FOR UPDATE TO authenticated
  USING (
    tenant_id = (SELECT auth.uid())
    OR tenant_id IN (SELECT p.id FROM public.profiles p WHERE p.parent_user_id = (SELECT auth.uid()))
    OR tenant_id = (SELECT p.parent_user_id FROM public.profiles p WHERE p.id = (SELECT auth.uid()))
    OR public.eh_admin_plataforma()
  )
  WITH CHECK (
    tenant_id = (SELECT auth.uid())
    OR tenant_id IN (SELECT p.id FROM public.profiles p WHERE p.parent_user_id = (SELECT auth.uid()))
    OR tenant_id = (SELECT p.parent_user_id FROM public.profiles p WHERE p.id = (SELECT auth.uid()))
    OR public.eh_admin_plataforma()
  );

-- DOWN (rollback manual): recriar as duas policies sem a 3ª cláusula (membro→dono).
;
