create table if not exists public.campanhas_babel (
  id                      uuid primary key default gen_random_uuid(),
  nome                    text not null,
  nicho_id                uuid references public.nichos(id) on delete set null,
  origem                  text not null default 'anuncio_meta',
  status                  text not null default 'ativa',
  sla_primeiro_toque_min  integer not null default 30,
  observacao              text,
  criado_em               timestamptz not null default now(),
  atualizado_em           timestamptz not null default now(),
  deleted_at              timestamptz
);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'campanhas_babel_origem_check') then
    alter table public.campanhas_babel add constraint campanhas_babel_origem_check
      check (origem in ('anuncio_meta','landing','instagram_dm','qr','indicacao','disparo_babel','manual'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'campanhas_babel_status_check') then
    alter table public.campanhas_babel add constraint campanhas_babel_status_check
      check (status in ('ativa','pausada','encerrada'));
  end if;
end $$;
create index if not exists campanhas_babel_nicho_idx on public.campanhas_babel (nicho_id) where deleted_at is null;
create table if not exists public.campanhas_babel_participantes (
  id                  uuid primary key default gen_random_uuid(),
  campanha_babel_id   uuid not null references public.campanhas_babel(id) on delete cascade,
  tenant_id           uuid not null references public.profiles(id) on delete cascade,
  peso                numeric(8,3) not null default 1,
  teto_total          integer,
  limite_dia          integer,
  pausado             boolean not null default false,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now(),
  deleted_at          timestamptz,
  unique (campanha_babel_id, tenant_id)
);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'campanhas_babel_participantes_peso_check') then
    alter table public.campanhas_babel_participantes add constraint campanhas_babel_participantes_peso_check
      check (peso > 0);
  end if;
end $$;
create index if not exists campanhas_babel_participantes_tenant_idx on public.campanhas_babel_participantes (tenant_id);
create table if not exists public.leads_babel (
  id                  uuid primary key default gen_random_uuid(),
  campanha_babel_id   uuid references public.campanhas_babel(id) on delete set null,
  phone               text not null,
  nome                text,
  ctwa_clid           text,
  utm                 jsonb,
  ficha               jsonb not null default '{}'::jsonb,
  conversa_id         uuid,
  status              text not null default 'qualificando',
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now(),
  pronto_em           timestamptz,
  descartado_motivo   text,
  deleted_at          timestamptz
);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'leads_babel_status_check') then
    alter table public.leads_babel add constraint leads_babel_status_check
      check (status in ('qualificando','pronto','entregue','descartado'));
  end if;
end $$;
create index if not exists leads_babel_campanha_idx on public.leads_babel (campanha_babel_id);
create index if not exists leads_babel_status_idx   on public.leads_babel (status) where status in ('qualificando','pronto');
create unique index if not exists leads_babel_campanha_phone_unico
  on public.leads_babel (campanha_babel_id, regexp_replace(phone, '\D', '', 'g'))
  where deleted_at is null;
create table if not exists public.entregas_lead_babel (
  id                  uuid primary key default gen_random_uuid(),
  lead_babel_id       uuid not null references public.leads_babel(id) on delete cascade,
  campanha_babel_id   uuid not null references public.campanhas_babel(id) on delete cascade,
  tenant_id           uuid not null references public.profiles(id) on delete cascade,
  lead_id             uuid references public.leads(id) on delete set null,
  motivo_escolha      text,
  entregue_em         timestamptz not null default now(),
  primeiro_toque_em   timestamptz,
  devolvido_em        timestamptz,
  devolvido_motivo    text,
  deleted_at          timestamptz
);
create index if not exists entregas_lead_babel_lead_idx     on public.entregas_lead_babel (lead_babel_id);
create index if not exists entregas_lead_babel_campanha_idx on public.entregas_lead_babel (campanha_babel_id, entregue_em);
create index if not exists entregas_lead_babel_tenant_idx   on public.entregas_lead_babel (tenant_id, entregue_em);
create index if not exists entregas_lead_babel_leadid_idx   on public.entregas_lead_babel (lead_id);
create unique index if not exists entregas_lead_babel_sem_duplicata
  on public.entregas_lead_babel (lead_babel_id, tenant_id) where devolvido_em is null and deleted_at is null;
alter table public.campanhas_babel               enable row level security;
alter table public.campanhas_babel_participantes enable row level security;
alter table public.leads_babel                   enable row level security;
alter table public.entregas_lead_babel           enable row level security;
drop policy if exists campanhas_babel_admin on public.campanhas_babel;
create policy campanhas_babel_admin on public.campanhas_babel
  for all to authenticated
  using ((select public.eh_admin_plataforma()))
  with check ((select public.eh_admin_plataforma()));
drop policy if exists participantes_admin on public.campanhas_babel_participantes;
create policy participantes_admin on public.campanhas_babel_participantes
  for all to authenticated
  using ((select public.eh_admin_plataforma()))
  with check ((select public.eh_admin_plataforma()));
drop policy if exists participantes_tenant_le on public.campanhas_babel_participantes;
create policy participantes_tenant_le on public.campanhas_babel_participantes
  for select to authenticated
  using (tenant_id = (select auth.uid()));
drop policy if exists leads_babel_admin on public.leads_babel;
create policy leads_babel_admin on public.leads_babel
  for all to authenticated
  using ((select public.eh_admin_plataforma()))
  with check ((select public.eh_admin_plataforma()));
drop policy if exists entregas_admin on public.entregas_lead_babel;
create policy entregas_admin on public.entregas_lead_babel
  for all to authenticated
  using ((select public.eh_admin_plataforma()))
  with check ((select public.eh_admin_plataforma()));
drop policy if exists entregas_tenant_le on public.entregas_lead_babel;
create policy entregas_tenant_le on public.entregas_lead_babel
  for select to authenticated
  using (tenant_id = (select auth.uid()));
create or replace function public.rotear_lead_babel(p_lead_babel_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead      public.leads_babel%rowtype;
  v_hoje      date := (now() at time zone 'America/Sao_Paulo')::date;
  v_escolhido record;
  v_entrega   uuid;
begin
  select * into v_lead from public.leads_babel where id = p_lead_babel_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'lead_nao_encontrado');
  end if;
  if v_lead.campanha_babel_id is null then
    return jsonb_build_object('ok', false, 'erro', 'lead_sem_campanha');
  end if;
  if v_lead.status <> 'pronto' then
    return jsonb_build_object('ok', false, 'erro', 'lead_nao_esta_pronto', 'status', v_lead.status);
  end if;
  perform pg_advisory_xact_lock(hashtext(v_lead.campanha_babel_id::text));
  with elegiveis as (
    select p.tenant_id, p.peso, p.criado_em as entrou_em,
           (select count(*) from public.entregas_lead_babel e
             where e.campanha_babel_id = p.campanha_babel_id and e.tenant_id = p.tenant_id
               and e.devolvido_em is null and e.deleted_at is null) as entregues,
           (select count(*) from public.entregas_lead_babel e
             where e.campanha_babel_id = p.campanha_babel_id and e.tenant_id = p.tenant_id
               and e.devolvido_em is null and e.deleted_at is null
               and (e.entregue_em at time zone 'America/Sao_Paulo')::date = v_hoje) as entregues_hoje,
           (select count(*) from public.entregas_lead_babel e
             where e.campanha_babel_id = p.campanha_babel_id
               and e.devolvido_em is null and e.deleted_at is null
               and e.entregue_em >= p.criado_em) as total_desde_que_entrou,
           p.teto_total, p.limite_dia
      from public.campanhas_babel_participantes p
      join public.campanhas_babel c on c.id = p.campanha_babel_id
                                   and c.status = 'ativa' and c.deleted_at is null
     where p.campanha_babel_id = v_lead.campanha_babel_id
       and p.pausado = false and p.deleted_at is null
  ),
  aptos as (
    select * from elegiveis
     where (teto_total is null or entregues < teto_total)
       and (limite_dia is null or entregues_hoje < limite_dia)
  ),
  soma as (select sum(peso) as soma_peso from aptos),
  ranqueado as (
    select a.tenant_id, a.entregues,
           (a.peso / s.soma_peso) * a.total_desde_que_entrou as alvo,
           ((a.peso / s.soma_peso) * a.total_desde_que_entrou) - a.entregues as atraso,
           a.peso
      from aptos a cross join soma s
  )
  select tenant_id, entregues, alvo, atraso
    into v_escolhido
    from ranqueado
   order by atraso desc, peso desc, entregues asc, tenant_id
   limit 1;
  if v_escolhido.tenant_id is null then
    return jsonb_build_object('ok', false, 'erro', 'ninguem_elegivel');
  end if;
  insert into public.entregas_lead_babel (lead_babel_id, campanha_babel_id, tenant_id, motivo_escolha)
  values (p_lead_babel_id, v_lead.campanha_babel_id, v_escolhido.tenant_id,
          format('%s lead(s) atrás do alvo (alvo %s, entregues %s)',
                 round(v_escolhido.atraso::numeric, 2), round(v_escolhido.alvo::numeric, 2), v_escolhido.entregues))
  returning id into v_entrega;
  update public.leads_babel
     set status = 'entregue', atualizado_em = now()
   where id = p_lead_babel_id;
  return jsonb_build_object('ok', true, 'entrega_id', v_entrega, 'tenant_id', v_escolhido.tenant_id,
                            'motivo', format('%s lead(s) atrás do alvo', round(v_escolhido.atraso::numeric, 2)));
end;
$$;
revoke all on function public.rotear_lead_babel(uuid) from public, anon;
grant execute on function public.rotear_lead_babel(uuid) to authenticated, service_role;
create or replace function public.devolver_lead_babel(p_entrega_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead uuid;
begin
  update public.entregas_lead_babel
     set devolvido_em = now(), devolvido_motivo = coalesce(p_motivo, 'sem motivo')
   where id = p_entrega_id and devolvido_em is null and deleted_at is null
   returning lead_babel_id into v_lead;
  if v_lead is null then
    return jsonb_build_object('ok', false, 'erro', 'entrega_nao_encontrada_ou_ja_devolvida');
  end if;
  update public.leads_babel set status = 'pronto', atualizado_em = now() where id = v_lead;
  return jsonb_build_object('ok', true, 'lead_babel_id', v_lead);
end;
$$;
revoke all on function public.devolver_lead_babel(uuid, text) from public, anon;
grant execute on function public.devolver_lead_babel(uuid, text) to authenticated, service_role;
create or replace function public.pausar_minha_entrada_babel(p_campanha_babel_id uuid, p_pausado boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.campanhas_babel_participantes
     set pausado = p_pausado, atualizado_em = now()
   where campanha_babel_id = p_campanha_babel_id
     and tenant_id = (select auth.uid())
     and deleted_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'nao_participa');
  end if;
  return jsonb_build_object('ok', true, 'pausado', p_pausado);
end;
$$;
revoke all on function public.pausar_minha_entrada_babel(uuid, boolean) from public, anon;
grant execute on function public.pausar_minha_entrada_babel(uuid, boolean) to authenticated;
;
