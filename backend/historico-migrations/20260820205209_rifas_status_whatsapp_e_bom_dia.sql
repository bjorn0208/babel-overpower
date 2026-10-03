-- Status do WhatsApp a cada 30min + ritual do bom-dia da rifa (opt-in) — 2026-08-20
alter table public.rifas_config_tenant
  add column if not exists postar_status_ativo boolean not null default false,
  add column if not exists status_ultimo_post_em timestamptz,
  add column if not exists bom_dia_rifa_ativo boolean not null default false;

comment on column public.rifas_config_tenant.postar_status_ativo is
  'Cron postar_status_rifas (*/30min) publica resumo das rifas ativas no Status do WhatsApp do tenant quando true.';
comment on column public.rifas_config_tenant.bom_dia_rifa_ativo is
  'Ritual bom-dia: cron 07h BRT sauda os contatos oferecendo a rifa do dia (opt-in); sem resposta até 12h BRT recebe follow-up com o estado da rifa.';

-- Rastreio do ritual: 1 linha por lead saudado por dia (dedup + base do follow-up)
create table if not exists public.rifa_bom_dia_envios (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.profiles(id) on delete cascade,
  rifa_id uuid not null references public.rifas(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  conversa_id uuid references public.conversas(id) on delete set null,
  dia date not null,
  saudado_em timestamptz not null default now(),
  followup_em timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, lead_id, dia)
);

comment on table public.rifa_bom_dia_envios is
  'Ritual bom-dia da rifa: quem foi saudado hoje (dedup) e quem levou follow-up ao meio-dia. Escrita: service_role no cron.';

create index if not exists rifa_bom_dia_envios_tenant_dia_idx on public.rifa_bom_dia_envios (tenant_id, dia);
create index if not exists rifa_bom_dia_envios_rifa_idx on public.rifa_bom_dia_envios (rifa_id);
create index if not exists rifa_bom_dia_envios_lead_idx on public.rifa_bom_dia_envios (lead_id);
create index if not exists rifa_bom_dia_envios_conversa_idx on public.rifa_bom_dia_envios (conversa_id);

alter table public.rifa_bom_dia_envios enable row level security;

create policy "rifa_bom_dia_tenant_le" on public.rifa_bom_dia_envios
  for select to authenticated
  using (tenant_id = (select auth.uid()));
;
