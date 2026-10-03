-- Galeria de artes da rifa (aba Imagens do app Rifas) — 2026-08-20.
-- O editor compõe a arte (foto + legenda do dia + rifeiro + pódios + hora do
-- sorteio) e salva aqui; cron-status-rifa e envios do agente consomem a mais
-- recente de cada rifa.
create table if not exists public.rifa_imagens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.profiles(id) on delete cascade,
  rifa_id uuid not null references public.rifas(id) on delete cascade,
  url text not null,
  legenda text,
  nome_rifeiro text,
  hora_sorteio text,
  premios jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table public.rifa_imagens is
  'Galeria de artes da rifa (aba Imagens). premios = pódios [{posicao, premio}]. A arte mais recente (deleted_at null) é a usada no Status e nos envios do agente.';

create index if not exists rifa_imagens_rifa_idx on public.rifa_imagens (rifa_id, created_at desc);
create index if not exists rifa_imagens_tenant_idx on public.rifa_imagens (tenant_id);

alter table public.rifa_imagens enable row level security;

create policy "rifa_imagens_tenant_tudo" on public.rifa_imagens
  for all to authenticated
  using (tenant_id = (select auth.uid()))
  with check (tenant_id = (select auth.uid()));
;
