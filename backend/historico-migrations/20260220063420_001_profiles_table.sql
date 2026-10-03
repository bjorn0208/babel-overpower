
-- 1. Profiles table (create FIRST)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  phone text,
  avatar_url text,
  document text,
  system_role text not null default 'user' check (system_role in ('platform_admin', 'user')),
  referral_code text unique default substr(md5(random()::text), 1, 8),
  referred_by uuid references public.profiles(id),
  indicator_commission_pct numeric(5,2) default 0,
  is_active boolean default true,
  metadata jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. Helper: is_platform_admin (SECURITY DEFINER)
create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
    and system_role = 'platform_admin'
  );
$$;

-- 3. RLS on profiles
alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (id = auth.uid());

create policy "profiles_select_admin" on public.profiles
  for select using (public.is_platform_admin());

create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid());

create policy "profiles_update_admin" on public.profiles
  for update using (public.is_platform_admin());

create policy "profiles_insert" on public.profiles
  for insert with check (id = auth.uid());

-- 4. Trigger: auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.email, '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 5. Platform Settings table (singleton)
create table public.platform_settings (
  id uuid primary key default gen_random_uuid(),
  system_name text not null default 'SaaS Platform',
  logo_url text default '',
  pix_key text default '',
  support_email text default '',
  domain text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.platform_settings enable row level security;

create policy "settings_select_public" on public.platform_settings
  for select using (true);

create policy "settings_update_admin" on public.platform_settings
  for update using (public.is_platform_admin());

create policy "settings_insert_admin" on public.platform_settings
  for insert with check (public.is_platform_admin());

-- 6. Seed default settings row
insert into public.platform_settings (system_name) values ('SaaS Platform');

;
