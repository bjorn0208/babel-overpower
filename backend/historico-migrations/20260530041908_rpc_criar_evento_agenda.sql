-- Cria evento manual na Agenda resolvendo o tenant (dono ou parent do membro).
create or replace function public.criar_evento_agenda(
  p_titulo text,
  p_inicio_em timestamptz,
  p_tipo text default 'outro',
  p_fim_em timestamptz default null,
  p_descricao text default null,
  p_dia_inteiro boolean default false,
  p_cor text default 'azul'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_tenant uuid;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'nao_autenticado';
  end if;
  if p_inicio_em is null then
    raise exception 'inicio_obrigatorio';
  end if;
  if coalesce(nullif(btrim(p_titulo), ''), '') = '' then
    raise exception 'titulo_obrigatorio';
  end if;
  if p_tipo not in ('reuniao','tarefa','lembrete','outro') then
    raise exception 'tipo_invalido';
  end if;

  select coalesce(p.parent_user_id, p.id) into v_tenant
    from public.profiles p where p.id = v_uid;
  if v_tenant is null then
    v_tenant := v_uid;
  end if;

  insert into public.eventos_agenda (tenant_id, criado_por, titulo, descricao, tipo, inicio_em, fim_em, dia_inteiro, cor)
    values (v_tenant, v_uid, btrim(p_titulo), p_descricao, p_tipo, p_inicio_em, p_fim_em, coalesce(p_dia_inteiro, false), coalesce(nullif(btrim(p_cor),''),'azul'))
    returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.criar_evento_agenda(text, timestamptz, text, timestamptz, text, boolean, text) from public;
grant execute on function public.criar_evento_agenda(text, timestamptz, text, timestamptz, text, boolean, text) to authenticated;
;
