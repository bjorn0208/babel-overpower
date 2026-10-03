-- Alinha a visibilidade de compromissos com eventos_agenda: o tenant (dono) e
-- toda a equipe (membros com parent_user_id = dono) enxergam os compromissos do
-- agente. Mesmo padrão coalesce(parent_user_id, id) já usado em eventos_agenda.
-- service_role (motor) segue intacto pela policy compromissos_service_role.
ALTER POLICY compromissos_tenant_all ON public.compromissos
USING (
  (tenant_id = (SELECT COALESCE(p.parent_user_id, p.id) FROM public.profiles p WHERE p.id = (SELECT auth.uid())))
  OR (tenant_id IN (SELECT p.id FROM public.profiles p WHERE p.parent_user_id = (SELECT auth.uid())))
  OR public.eh_admin_plataforma()
)
WITH CHECK (
  (tenant_id = (SELECT COALESCE(p.parent_user_id, p.id) FROM public.profiles p WHERE p.id = (SELECT auth.uid())))
  OR (tenant_id IN (SELECT p.id FROM public.profiles p WHERE p.parent_user_id = (SELECT auth.uid())))
  OR public.eh_admin_plataforma()
);
;
