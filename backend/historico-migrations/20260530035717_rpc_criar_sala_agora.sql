-- Cria sala instantânea (status ao_vivo) já com o anfitrião registrado. Resolve tenant (dono ou parent do membro).
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
begin
  if v_uid is null then
    raise exception 'nao_autenticado';
  end if;

  select coalesce(p.parent_user_id, p.id) into v_tenant
    from public.profiles p where p.id = v_uid;
  if v_tenant is null then
    v_tenant := v_uid;
  end if;

  v_titulo := coalesce(nullif(btrim(p_titulo), ''), 'Reunião');

  insert into public.salas_reuniao (tenant_id, criada_por, titulo, status, max_participantes, iniciada_em)
    values (v_tenant, v_uid, v_titulo, 'ao_vivo', coalesce(p_max, 6), now())
    returning id, chave_publica into v_sala_id, v_chave;

  insert into public.salas_reuniao_participantes (sala_id, user_id, papel)
    values (v_sala_id, v_uid, 'anfitriao');

  return jsonb_build_object('sala_id', v_sala_id, 'chave_publica', v_chave, 'titulo', v_titulo);
end;
$$;

revoke all on function public.criar_sala_agora(text, integer) from public;
grant execute on function public.criar_sala_agora(text, integer) to authenticated;
;
