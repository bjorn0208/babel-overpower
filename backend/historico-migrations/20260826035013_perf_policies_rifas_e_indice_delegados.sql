-- Perf advisors (26/08): policies das tabelas novas com (select auth.uid())
-- em vez de auth.uid() por linha, e índice no FK de agentes_delegados.

drop policy if exists rifa_numeros_fixos_tenant on public.rifa_numeros_fixos;
create policy rifa_numeros_fixos_tenant on public.rifa_numeros_fixos
  for all using (tenant_id = (select auth.uid())) with check (tenant_id = (select auth.uid()));

drop policy if exists rifa_dividas_tenant on public.rifa_dividas;
create policy rifa_dividas_tenant on public.rifa_dividas
  for all using (tenant_id = (select auth.uid())) with check (tenant_id = (select auth.uid()));

create index if not exists idx_agentes_delegados_gestor
  on public.agentes_delegados (gestor_user_id);
;
