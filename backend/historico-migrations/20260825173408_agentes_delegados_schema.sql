-- Delegação de agentes (Dominic, 25/08/2026): titular pode delegar a gestão
-- de um agente seu a usuário de outra conta (aba Agente mostra no seletor;
-- identidade editável). Lookups via SECURITY DEFINER evitam recursão de RLS.
-- Testado no espelho local. Apenas schema — nenhuma delegação é criada aqui.

create table if not exists public.agentes_delegados (
  agente_id uuid not null references public.agentes(id) on delete cascade,
  gestor_user_id uuid not null references public.profiles(id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (agente_id, gestor_user_id)
);

alter table public.agentes_delegados enable row level security;

create or replace function public.fn_sou_gestor_delegado(p_agente uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
    select 1 from public.agentes_delegados d
    where d.agente_id = p_agente and d.gestor_user_id = (select auth.uid())
  )
$$;

create or replace function public.fn_sou_dono_do_agente(p_agente uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
    select 1 from public.agentes a
    where a.id = p_agente and a.user_id = (select auth.uid())
  )
$$;

drop policy if exists delegacao_gestor_le on public.agentes_delegados;
create policy delegacao_gestor_le on public.agentes_delegados
  for select using (gestor_user_id = (select auth.uid()));

drop policy if exists delegacao_dono_gerencia on public.agentes_delegados;
create policy delegacao_dono_gerencia on public.agentes_delegados
  for all using (public.fn_sou_dono_do_agente(agente_id))
  with check (public.fn_sou_dono_do_agente(agente_id));

drop policy if exists delegado_read_agent on public.agentes;
create policy delegado_read_agent on public.agentes
  for select using (public.fn_sou_gestor_delegado(id));

drop policy if exists delegado_update_agent on public.agentes;
create policy delegado_update_agent on public.agentes
  for update using (public.fn_sou_gestor_delegado(id))
  with check (public.fn_sou_gestor_delegado(id));
;
