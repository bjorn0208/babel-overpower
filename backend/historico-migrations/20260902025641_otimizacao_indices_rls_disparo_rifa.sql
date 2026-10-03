drop index if exists public.idx_rifa_agend_disparo_rifa;
drop index if exists public.idx_rifa_agend_disparo_tenant;
drop index if exists public.idx_rifa_disparo_envios_agend;
drop index if exists public.idx_rifa_disparo_envios_tenant;

create index if not exists rifa_disparo_envios_lista_disparo_idx
  on public.rifa_disparo_envios (lista_disparo_id);

drop policy if exists rifa_agendamentos_disparo_tenant_tudo on public.rifa_agendamentos_disparo;

;
