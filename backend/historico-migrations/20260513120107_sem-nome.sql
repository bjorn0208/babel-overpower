-- ============ Preferências de UI por usuário ============
create table if not exists public.preferencias_ui_usuario (
  user_id uuid primary key references auth.users(id) on delete cascade,
  papel_parede_id text not null default 'aurora',
  widgets_ativos jsonb not null default '["relogio"]'::jsonb,
  widgets_posicoes jsonb not null default '{}'::jsonb,
  badges_zerados jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.preferencias_ui_usuario enable row level security;

create policy "preferencias_ui_select_proprio"
  on public.preferencias_ui_usuario for select
  to authenticated
  using (auth.uid() = user_id);

create policy "preferencias_ui_insert_proprio"
  on public.preferencias_ui_usuario for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "preferencias_ui_update_proprio"
  on public.preferencias_ui_usuario for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "preferencias_ui_delete_proprio"
  on public.preferencias_ui_usuario for delete
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.atualizar_timestamp_preferencias_ui()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_preferencias_ui_updated_at on public.preferencias_ui_usuario;
create trigger trg_preferencias_ui_updated_at
  before update on public.preferencias_ui_usuario
  for each row execute function public.atualizar_timestamp_preferencias_ui();


-- ============ Notificações por usuário ============
create table if not exists public.notificacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tipo text not null default 'info',
  icone text not null default 'bell',
  titulo text not null,
  mensagem text,
  acao text,
  acao_label text,
  lida boolean not null default false,
  lida_em timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_notificacoes_user_created on public.notificacoes(user_id, created_at desc);
create index if not exists idx_notificacoes_user_lida on public.notificacoes(user_id, lida);

alter table public.notificacoes enable row level security;

create policy "notificacoes_select_proprio"
  on public.notificacoes for select
  to authenticated
  using (auth.uid() = user_id);

create policy "notificacoes_update_proprio"
  on public.notificacoes for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "notificacoes_delete_proprio"
  on public.notificacoes for delete
  to authenticated
  using (auth.uid() = user_id);

-- Admin de plataforma pode inserir notificações para qualquer usuário
create policy "notificacoes_insert_admin"
  on public.notificacoes for insert
  to authenticated
  with check (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.role::text ilike '%admin%'
    )
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and coalesce(p.system_role::text, '') ilike '%admin%'
    )
  );

-- Trigger para preencher lida_em automaticamente
create or replace function public.marcar_lida_em_notificacao()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.lida = true and (old.lida is distinct from true) then
    new.lida_em = now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notificacoes_lida_em on public.notificacoes;
create trigger trg_notificacoes_lida_em
  before update on public.notificacoes
  for each row execute function public.marcar_lida_em_notificacao();
;
