
-- Tabela profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  phone text,
  avatar_url text,
  system_role text not null default 'user' check (system_role in ('platform_admin', 'user')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Trigger auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS
alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

create policy "profiles_admin_select_all" on public.profiles
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and system_role = 'platform_admin')
  );

create policy "profiles_admin_update_all" on public.profiles
  for update using (
    exists (select 1 from public.profiles where id = auth.uid() and system_role = 'platform_admin')
  );

create policy "profiles_admin_insert" on public.profiles
  for insert with check (
    exists (select 1 from public.profiles where id = auth.uid() and system_role = 'platform_admin')
  );

;
