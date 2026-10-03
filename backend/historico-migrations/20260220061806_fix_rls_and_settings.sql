
-- Helper function pra checar admin sem trigger RLS recursion
create or replace function public.is_platform_admin()
returns boolean as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and system_role = 'platform_admin'
  );
$$ language sql security definer stable;

-- Drop policies com recursao
drop policy if exists "profiles_admin_select_all" on public.profiles;
drop policy if exists "profiles_admin_update_all" on public.profiles;
drop policy if exists "profiles_admin_insert" on public.profiles;

-- Recriar sem recursao
create policy "profiles_admin_select_all" on public.profiles
  for select using (public.is_platform_admin());

create policy "profiles_admin_update_all" on public.profiles
  for update using (public.is_platform_admin());

create policy "profiles_admin_insert" on public.profiles
  for insert with check (public.is_platform_admin());

-- Tabela platform_settings
create table public.platform_settings (
  id uuid primary key default gen_random_uuid(),
  system_name text not null default 'Plataforma',
  logo_url text,
  pix_key text,
  support_email text,
  domain text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.platform_settings enable row level security;

create policy "platform_settings_public_read" on public.platform_settings
  for select using (true);

create policy "platform_settings_admin_write" on public.platform_settings
  for all using (public.is_platform_admin());

-- Seed com valor padrao
insert into public.platform_settings (system_name) values ('Plataforma');

;
