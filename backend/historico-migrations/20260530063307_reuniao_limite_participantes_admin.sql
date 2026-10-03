-- Teto global de participantes por reunião, configurável pelo admin.
alter table public.config_plataforma
  add column if not exists reuniao_limite_participantes integer not null default 6
  constraint config_plataforma_reuniao_limite_chk check (reuniao_limite_participantes between 2 and 50);

-- criar_sala_agora: clampa max ao teto do admin
create or replace function public.criar_sala_agora(p_titulo text, p_max integer default 6)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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

  insert into public.salas_reuniao (tenant_id, criada_por, titulo, status, max_participantes, iniciada_em)
    values (v_tenant, v_uid, v_titulo, 'ao_vivo', v_max, now())
    returning id, chave_publica into v_sala_id, v_chave;

  insert into public.salas_reuniao_participantes (sala_id, user_id, papel)
    values (v_sala_id, v_uid, 'anfitriao');

  return jsonb_build_object('sala_id', v_sala_id, 'chave_publica', v_chave, 'titulo', v_titulo, 'max_participantes', v_max);
end;
$$;

-- agendar_reuniao: clampa max ao teto do admin
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

  insert into public.salas_reuniao (tenant_id, criada_por, titulo, status, max_participantes, agendada_para, duracao_min)
    values (v_tenant, v_uid, v_titulo, 'agendada', v_max, p_agendada_para, coalesce(p_duracao_min, 60))
    returning id, chave_publica into v_sala_id, v_chave;

  insert into public.eventos_agenda (tenant_id, criado_por, titulo, tipo, inicio_em, fim_em, sala_reuniao_id, cor)
    values (v_tenant, v_uid, v_titulo, 'reuniao', p_agendada_para,
            p_agendada_para + (coalesce(p_duracao_min, 60) || ' minutes')::interval, v_sala_id, 'azul')
    returning id into v_evento_id;

  return jsonb_build_object('sala_id', v_sala_id, 'evento_id', v_evento_id, 'chave_publica', v_chave, 'max_participantes', v_max);
end;
$$;
;
