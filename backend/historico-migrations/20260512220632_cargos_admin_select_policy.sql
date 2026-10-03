-- Permite que platform admins (eh_admin_plataforma()) leiam cargos de qualquer tenant.
-- Bug original: durante impersonação, admin não conseguia ver cargos do tenant impersonado
-- porque as policies existentes só permitiam tenant_id = auth.uid() OU escopo = 'global'.
-- Sintoma: KanbanAtendimento renderizava "Nenhum cargo configurado" mesmo havendo 6 cargos.

create policy "cargos_admin_lista"
  on public.cargos
  for select
  to authenticated
  using (public.eh_admin_plataforma());

comment on policy "cargos_admin_lista" on public.cargos is
  'Permite platform admin ver cargos de qualquer tenant — necessário pra impersonação funcionar.';
;
