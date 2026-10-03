-- Reunião v2: sala de espera (aprovação do anfitrião) + info pública com marca do tenant

-- 1. Flag de aprovação por sala (recurso liga/desliga)
alter table public.salas_reuniao
  add column if not exists exige_aprovacao boolean not null default false;

-- 2. Status de entrada do participante
alter table public.salas_reuniao_participantes
  add column if not exists status_entrada text not null default 'aprovado';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sala_participantes_status_entrada_check'
  ) then
    alter table public.salas_reuniao_participantes
      add constraint sala_participantes_status_entrada_check
      check (status_entrada in ('pendente','aprovado','negado'));
  end if;
end $$;

create index if not exists idx_sala_participantes_pendentes
  on public.salas_reuniao_participantes (sala_id, status_entrada)
  where saiu_em is null;

-- 3. criar_sala_agora ganha p_exige_aprovacao (drop pra não criar overload ambíguo)
drop function if exists public.criar_sala_agora(text, integer);

create or replace function public.criar_sala_agora(
  p_titulo text,
  p_max integer default 6,
  p_exige_aprovacao boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_tenant uuid;
  v_sala_id uuid;
  v_chave uuid;
  v_titulo text;
  v_teto integer;
  v_max integer;
begin
  if v_uid is null then
    raise exception 'nao_autenticado';
  end if;

  select coalesce(p.parent_user_id, p.id) into v_tenant
    from public.profiles p where p.id = v_uid;
  if v_tenant is null then
    v_tenant := v_uid;
  end if;

  select coalesce(reuniao_limite_participantes, 6) into v_teto from public.config_plataforma limit 1;
  if v_teto is null then v_teto := 6; end if;
  v_max := least(greatest(coalesce(p_max, 6), 2), v_teto);

  v_titulo := coalesce(nullif(btrim(p_titulo), ''), 'Reunião');

  insert into public.salas_reuniao (tenant_id, criada_por, titulo, status, max_participantes, iniciada_em, exige_aprovacao)
    values (v_tenant, v_uid, v_titulo, 'ao_vivo', v_max, now(), coalesce(p_exige_aprovacao, false))
    returning id, chave_publica into v_sala_id, v_chave;

  insert into public.salas_reuniao_participantes (sala_id, user_id, papel)
    values (v_sala_id, v_uid, 'anfitriao');

  return jsonb_build_object(
    'sala_id', v_sala_id,
    'chave_publica', v_chave,
    'titulo', v_titulo,
    'max_participantes', v_max,
    'exige_aprovacao', coalesce(p_exige_aprovacao, false)
  );
end;
$function$;

-- 4. agendar_reuniao ganha p_exige_aprovacao
drop function if exists public.agendar_reuniao(text, timestamptz, integer, integer);

create or replace function public.agendar_reuniao(
  p_titulo text,
  p_agendada_para timestamptz,
  p_duracao_min integer default 60,
  p_max integer default 6,
  p_exige_aprovacao boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_tenant uuid;
  v_sala_id uuid;
  v_evento_id uuid;
  v_chave uuid;
  v_titulo text;
  v_teto integer;
  v_max integer;
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

  select coalesce(reuniao_limite_participantes, 6) into v_teto from public.config_plataforma limit 1;
  if v_teto is null then v_teto := 6; end if;
  v_max := least(greatest(coalesce(p_max, 6), 2), v_teto);

  v_titulo := coalesce(nullif(btrim(p_titulo), ''), 'Reunião');

  insert into public.salas_reuniao (tenant_id, criada_por, titulo, status, max_participantes, agendada_para, duracao_min, exige_aprovacao)
    values (v_tenant, v_uid, v_titulo, 'agendada', v_max, p_agendada_para, coalesce(p_duracao_min, 60), coalesce(p_exige_aprovacao, false))
    returning id, chave_publica into v_sala_id, v_chave;

  insert into public.eventos_agenda (tenant_id, criado_por, titulo, tipo, inicio_em, fim_em, sala_reuniao_id, cor)
    values (v_tenant, v_uid, v_titulo, 'reuniao', p_agendada_para,
            p_agendada_para + (coalesce(p_duracao_min, 60) || ' minutes')::interval, v_sala_id, 'azul')
    returning id into v_evento_id;

  return jsonb_build_object('sala_id', v_sala_id, 'evento_id', v_evento_id, 'chave_publica', v_chave, 'max_participantes', v_max);
end;
$function$;

-- 5. entrar_sala_publica respeita sala de espera (mesma assinatura)
create or replace function public.entrar_sala_publica(p_chave uuid, p_nome text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_sala public.salas_reuniao%rowtype;
  v_ativos integer;
  v_nome text;
  v_participante_id uuid;
  v_status_entrada text;
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

  -- lotação conta só quem está aprovado e ativo
  select count(*) into v_ativos from public.salas_reuniao_participantes
    where sala_id = v_sala.id and saiu_em is null and status_entrada = 'aprovado';
  if v_ativos >= v_sala.max_participantes then
    raise exception 'sala_lotada';
  end if;

  v_status_entrada := case when v_sala.exige_aprovacao then 'pendente' else 'aprovado' end;

  insert into public.salas_reuniao_participantes (sala_id, nome_convidado, papel, status_entrada)
    values (v_sala.id, v_nome, 'participante', v_status_entrada)
    returning id into v_participante_id;

  return jsonb_build_object(
    'sala_id', v_sala.id,
    'participante_id', v_participante_id,
    'titulo', v_sala.titulo,
    'modo', v_sala.modo,
    'transporte', v_sala.transporte,
    'max_participantes', v_sala.max_participantes,
    'status', v_sala.status,
    'status_entrada', v_status_entrada,
    'exige_aprovacao', v_sala.exige_aprovacao
  );
end;
$function$;

-- 6. Anfitrião responde pedido de entrada (persiste decisão)
create or replace function public.responder_entrada_sala(p_participante_id uuid, p_aprovar boolean)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_sala public.salas_reuniao%rowtype;
  v_participante public.salas_reuniao_participantes%rowtype;
begin
  if v_uid is null then
    raise exception 'nao_autenticado';
  end if;

  select * into v_participante from public.salas_reuniao_participantes
    where id = p_participante_id
    for update;
  if not found then
    raise exception 'participante_nao_encontrado';
  end if;

  select * into v_sala from public.salas_reuniao where id = v_participante.sala_id;

  -- só o criador da sala ou alguém do tenant dela pode responder
  if v_sala.criada_por <> v_uid
     and v_sala.tenant_id <> (select coalesce(p.parent_user_id, p.id) from public.profiles p where p.id = v_uid) then
    raise exception 'sem_permissao';
  end if;

  update public.salas_reuniao_participantes
    set status_entrada = case when p_aprovar then 'aprovado' else 'negado' end,
        saiu_em = case when p_aprovar then saiu_em else now() end
    where id = p_participante_id;

  return jsonb_build_object('participante_id', p_participante_id, 'aprovado', p_aprovar);
end;
$function$;

-- 7. Info pública da sala (pré-join branded): título + marca do tenant
create or replace function public.info_sala_publica(p_chave uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_sala public.salas_reuniao%rowtype;
  v_empresa record;
  v_perfil record;
begin
  select * into v_sala from public.salas_reuniao
    where chave_publica = p_chave and deleted_at is null;
  if not found then
    raise exception 'sala_nao_encontrada';
  end if;

  select nome, logo_url, banner_url, descricao, cidade, estado
    into v_empresa
    from public.empresas where user_id = v_sala.tenant_id
    limit 1;

  select headline, chips
    into v_perfil
    from public.perfil_publico where user_id = v_sala.tenant_id and is_active = true
    limit 1;

  return jsonb_build_object(
    'titulo', v_sala.titulo,
    'status', v_sala.status,
    'exige_aprovacao', v_sala.exige_aprovacao,
    'agendada_para', v_sala.agendada_para,
    'empresa_nome', v_empresa.nome,
    'empresa_logo_url', v_empresa.logo_url,
    'empresa_banner_url', v_empresa.banner_url,
    'empresa_descricao', v_empresa.descricao,
    'empresa_cidade', v_empresa.cidade,
    'empresa_estado', v_empresa.estado,
    'empresa_headline', v_perfil.headline,
    'empresa_chips', v_perfil.chips
  );
end;
$function$;
;
