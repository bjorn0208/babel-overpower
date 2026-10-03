-- App Reunião (videochamada WebRTC modo direto) + Agenda viva
-- 3 tabelas + RLS tenant (dono+equipe) + 2 RPCs SECURITY DEFINER. Sem edge.

-- ========== TABELA 1: salas_reuniao ==========
create table if not exists public.salas_reuniao (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.profiles(id) on delete cascade,
  criada_por uuid not null references public.profiles(id),
  titulo text not null default 'Reunião' check (length(titulo) <= 200),
  modo text not null default 'conversa' check (modo in ('conversa','evento')),
  transporte text not null default 'direto' check (transporte in ('direto','servidor')),
  status text not null default 'agendada' check (status in ('agendada','ao_vivo','encerrada','cancelada')),
  chave_publica uuid not null default gen_random_uuid() unique,
  max_participantes integer not null default 6 check (max_participantes between 2 and 50),
  agendada_para timestamptz,
  duracao_min integer check (duracao_min is null or duracao_min between 5 and 1440),
  iniciada_em timestamptz,
  encerrada_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_salas_reuniao_tenant on public.salas_reuniao (tenant_id);
create index if not exists idx_salas_reuniao_criada_por on public.salas_reuniao (criada_por);
create index if not exists idx_salas_reuniao_agendadas on public.salas_reuniao (tenant_id, agendada_para)
  where status = 'agendada' and deleted_at is null;

alter table public.salas_reuniao enable row level security;

create policy salas_reuniao_tenant_all on public.salas_reuniao
  for all to authenticated
  using (
    tenant_id = (select coalesce(p.parent_user_id, p.id) from public.profiles p where p.id = (select auth.uid()))
    or tenant_id in (select p.id from public.profiles p where p.parent_user_id = (select auth.uid()))
    or eh_admin_plataforma()
  )
  with check (
    tenant_id = (select coalesce(p.parent_user_id, p.id) from public.profiles p where p.id = (select auth.uid()))
    or tenant_id in (select p.id from public.profiles p where p.parent_user_id = (select auth.uid()))
    or eh_admin_plataforma()
  );

create policy salas_reuniao_service_role on public.salas_reuniao
  for all to service_role using (true) with check (true);

-- ========== TABELA 2: salas_reuniao_participantes ==========
create table if not exists public.salas_reuniao_participantes (
  id uuid primary key default gen_random_uuid(),
  sala_id uuid not null references public.salas_reuniao(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  nome_convidado text check (nome_convidado is null or length(nome_convidado) <= 120),
  papel text not null default 'participante' check (papel in ('anfitriao','participante')),
  entrou_em timestamptz not null default now(),
  saiu_em timestamptz,
  constraint participante_identidade check (user_id is not null or nome_convidado is not null)
);

create index if not exists idx_sala_participantes_sala on public.salas_reuniao_participantes (sala_id);
create index if not exists idx_sala_participantes_user on public.salas_reuniao_participantes (user_id)
  where user_id is not null;
create index if not exists idx_sala_participantes_ativos on public.salas_reuniao_participantes (sala_id)
  where saiu_em is null;

alter table public.salas_reuniao_participantes enable row level security;

create policy sala_participantes_tenant_all on public.salas_reuniao_participantes
  for all to authenticated
  using (
    exists (
      select 1 from public.salas_reuniao s
      where s.id = sala_id and (
        s.tenant_id = (select coalesce(p.parent_user_id, p.id) from public.profiles p where p.id = (select auth.uid()))
        or s.tenant_id in (select p.id from public.profiles p where p.parent_user_id = (select auth.uid()))
        or eh_admin_plataforma()
      )
    )
  )
  with check (
    exists (
      select 1 from public.salas_reuniao s
      where s.id = sala_id and (
        s.tenant_id = (select coalesce(p.parent_user_id, p.id) from public.profiles p where p.id = (select auth.uid()))
        or s.tenant_id in (select p.id from public.profiles p where p.parent_user_id = (select auth.uid()))
        or eh_admin_plataforma()
      )
    )
  );

create policy sala_participantes_service_role on public.salas_reuniao_participantes
  for all to service_role using (true) with check (true);

-- ========== TABELA 3: eventos_agenda (Agenda viva) ==========
create table if not exists public.eventos_agenda (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.profiles(id) on delete cascade,
  criado_por uuid not null references public.profiles(id),
  titulo text not null check (length(titulo) <= 200),
  descricao text,
  tipo text not null default 'outro' check (tipo in ('reuniao','tarefa','lembrete','outro')),
  inicio_em timestamptz not null,
  fim_em timestamptz,
  dia_inteiro boolean not null default false,
  sala_reuniao_id uuid references public.salas_reuniao(id) on delete set null,
  cor text not null default 'azul' check (length(cor) <= 30),
  status text not null default 'pendente' check (status in ('pendente','concluido','cancelado')),
  lembretes jsonb not null default '[]'::jsonb check (jsonb_typeof(lembretes) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint eventos_agenda_periodo check (fim_em is null or fim_em >= inicio_em)
);

create index if not exists idx_eventos_agenda_tenant_inicio on public.eventos_agenda (tenant_id, inicio_em)
  where deleted_at is null;
create index if not exists idx_eventos_agenda_sala on public.eventos_agenda (sala_reuniao_id)
  where sala_reuniao_id is not null;

alter table public.eventos_agenda enable row level security;

create policy eventos_agenda_tenant_all on public.eventos_agenda
  for all to authenticated
  using (
    tenant_id = (select coalesce(p.parent_user_id, p.id) from public.profiles p where p.id = (select auth.uid()))
    or tenant_id in (select p.id from public.profiles p where p.parent_user_id = (select auth.uid()))
    or eh_admin_plataforma()
  )
  with check (
    tenant_id = (select coalesce(p.parent_user_id, p.id) from public.profiles p where p.id = (select auth.uid()))
    or tenant_id in (select p.id from public.profiles p where p.parent_user_id = (select auth.uid()))
    or eh_admin_plataforma()
  );

create policy eventos_agenda_service_role on public.eventos_agenda
  for all to service_role using (true) with check (true);

-- ========== Triggers updated_at ==========
create trigger trg_salas_reuniao_updated_at before update on public.salas_reuniao
  for each row execute function moddatetime('updated_at');
create trigger trg_eventos_agenda_updated_at before update on public.eventos_agenda
  for each row execute function moddatetime('updated_at');

-- ========== RPC: entrar_sala_publica (convidado externo, anon) ==========
create or replace function public.entrar_sala_publica(p_chave uuid, p_nome text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sala public.salas_reuniao%rowtype;
  v_ativos integer;
  v_nome text;
  v_participante_id uuid;
begin
  v_nome := nullif(btrim(p_nome), '');
  if v_nome is null then
    raise exception 'nome_obrigatorio';
  end if;

  select * into v_sala from public.salas_reuniao
    where chave_publica = p_chave and deleted_at is null
    for update;
  if not found then
    raise exception 'sala_nao_encontrada';
  end if;
  if v_sala.status not in ('agendada','ao_vivo') then
    raise exception 'sala_indisponivel';
  end if;

  select count(*) into v_ativos from public.salas_reuniao_participantes
    where sala_id = v_sala.id and saiu_em is null;
  if v_ativos >= v_sala.max_participantes then
    raise exception 'sala_lotada';
  end if;

  insert into public.salas_reuniao_participantes (sala_id, nome_convidado, papel)
    values (v_sala.id, v_nome, 'participante')
    returning id into v_participante_id;

  return jsonb_build_object(
    'sala_id', v_sala.id,
    'participante_id', v_participante_id,
    'titulo', v_sala.titulo,
    'modo', v_sala.modo,
    'transporte', v_sala.transporte,
    'max_participantes', v_sala.max_participantes,
    'status', v_sala.status
  );
end;
$$;

revoke all on function public.entrar_sala_publica(uuid, text) from public;
grant execute on function public.entrar_sala_publica(uuid, text) to anon, authenticated;

-- ========== RPC: sair_sala_publica (convidado externo marca saída) ==========
create or replace function public.sair_sala_publica(p_participante_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.salas_reuniao_participantes
    set saiu_em = now()
    where id = p_participante_id and saiu_em is null;
end;
$$;

revoke all on function public.sair_sala_publica(uuid) from public;
grant execute on function public.sair_sala_publica(uuid) to anon, authenticated;

-- ========== RPC: agendar_reuniao (cria sala + evento atomicamente) ==========
create or replace function public.agendar_reuniao(
  p_titulo text,
  p_agendada_para timestamptz,
  p_duracao_min integer default 60,
  p_max integer default 6
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_tenant uuid;
  v_sala_id uuid;
  v_evento_id uuid;
  v_chave uuid;
  v_titulo text;
begin
  if v_uid is null then
    raise exception 'nao_autenticado';
  end if;
  if p_agendada_para is null then
    raise exception 'data_obrigatoria';
  end if;

  select coalesce(p.parent_user_id, p.id) into v_tenant
    from public.profiles p where p.id = v_uid;
  if v_tenant is null then
    v_tenant := v_uid;
  end if;

  v_titulo := coalesce(nullif(btrim(p_titulo), ''), 'Reunião');

  insert into public.salas_reuniao (tenant_id, criada_por, titulo, status, max_participantes, agendada_para, duracao_min)
    values (v_tenant, v_uid, v_titulo, 'agendada', coalesce(p_max, 6), p_agendada_para, coalesce(p_duracao_min, 60))
    returning id, chave_publica into v_sala_id, v_chave;

  insert into public.eventos_agenda (tenant_id, criado_por, titulo, tipo, inicio_em, fim_em, sala_reuniao_id, cor)
    values (v_tenant, v_uid, v_titulo, 'reuniao', p_agendada_para,
            p_agendada_para + (coalesce(p_duracao_min, 60) || ' minutes')::interval, v_sala_id, 'azul')
    returning id into v_evento_id;

  return jsonb_build_object('sala_id', v_sala_id, 'evento_id', v_evento_id, 'chave_publica', v_chave);
end;
$$;

revoke all on function public.agendar_reuniao(text, timestamptz, integer, integer) from public;
grant execute on function public.agendar_reuniao(text, timestamptz, integer, integer) to authenticated;
;
