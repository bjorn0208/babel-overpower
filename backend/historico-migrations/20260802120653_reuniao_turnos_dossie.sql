-- Reunião 2: transcrição com dono (turnos) + dossiê ao vivo por participante.
-- Escrita: só service_role (serviços da VPS). Leitura: dono do tenant + equipe.

create table if not exists public.salas_reuniao_turnos (
  id uuid primary key default gen_random_uuid(),
  sala_id uuid not null references public.salas_reuniao(id),
  tenant_id uuid not null references public.profiles(id),
  peer_id text not null,
  nome text not null default '',
  do_time boolean not null default false,
  texto text not null,
  falado_em timestamptz not null default now(),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists salas_reuniao_turnos_sala_idx on public.salas_reuniao_turnos (sala_id, falado_em);
create index if not exists salas_reuniao_turnos_tenant_idx on public.salas_reuniao_turnos (tenant_id);
alter table public.salas_reuniao_turnos enable row level security;
drop policy if exists "time_le_turnos" on public.salas_reuniao_turnos;
create policy "time_le_turnos" on public.salas_reuniao_turnos
  for select to authenticated
  using (
    tenant_id = (select auth.uid())
    or (select auth.uid()) in (
      select p.id from public.profiles p where p.parent_user_id = salas_reuniao_turnos.tenant_id
    )
  );

create table if not exists public.salas_reuniao_dossie (
  id uuid primary key default gen_random_uuid(),
  sala_id uuid not null references public.salas_reuniao(id),
  tenant_id uuid not null references public.profiles(id),
  peer_id text not null,
  nome text not null default '',
  dados jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now(),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint salas_reuniao_dossie_sala_peer_unico unique (sala_id, peer_id)
);
create index if not exists salas_reuniao_dossie_sala_idx on public.salas_reuniao_dossie (sala_id);
create index if not exists salas_reuniao_dossie_tenant_idx on public.salas_reuniao_dossie (tenant_id);
alter table public.salas_reuniao_dossie enable row level security;
drop policy if exists "time_le_dossie" on public.salas_reuniao_dossie;
create policy "time_le_dossie" on public.salas_reuniao_dossie
  for select to authenticated
  using (
    tenant_id = (select auth.uid())
    or (select auth.uid()) in (
      select p.id from public.profiles p where p.parent_user_id = salas_reuniao_dossie.tenant_id
    )
  );

-- down (rollback): drop table if exists public.salas_reuniao_dossie; drop table if exists public.salas_reuniao_turnos;

;
