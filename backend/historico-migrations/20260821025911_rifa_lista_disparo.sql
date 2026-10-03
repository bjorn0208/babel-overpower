-- Lista de disparo do bom-dia da rifa (2026-08-20, pedido do Theus/Dominic):
-- pessoas escolhidas a dedo (importadas de CSV/Excel ou à mão). Quando há
-- gente MARCADA, a saudação da manhã vai SÓ pra elas; lista vazia = fallback
-- pros leads recentes do tenant.
create table if not exists public.rifa_lista_disparo (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.profiles(id) on delete cascade,
  nome text,
  phone text not null,
  marcado boolean not null default true,
  origem text not null default 'csv',
  created_at timestamptz not null default now(),
  unique (tenant_id, phone)
);

comment on table public.rifa_lista_disparo is
  'Lista de disparo do bom-dia da rifa: quem está marcado recebe a saudação das 7h. Importada de CSV/Excel na aba Disparo do app Rifas.';

create index if not exists rifa_lista_disparo_tenant_idx on public.rifa_lista_disparo (tenant_id, marcado);

alter table public.rifa_lista_disparo enable row level security;

create policy "rifa_lista_disparo_tenant_tudo" on public.rifa_lista_disparo
  for all to authenticated
  using (tenant_id = (select auth.uid()))
  with check (tenant_id = (select auth.uid()));

-- Rifa do dia escolhida pro disparo (null = a ativa mais recente).
alter table public.rifas_config_tenant
  add column if not exists rifa_disparo_id uuid references public.rifas(id) on delete set null;

create index if not exists rifas_config_tenant_rifa_disparo_idx on public.rifas_config_tenant (rifa_disparo_id);

comment on column public.rifas_config_tenant.rifa_disparo_id is
  'Rifa do dia escolhida na aba Disparo pro bom-dia/followup. NULL = usa a rifa ativa mais recente.';
;
