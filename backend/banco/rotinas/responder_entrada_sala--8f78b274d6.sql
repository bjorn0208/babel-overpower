CREATE OR REPLACE FUNCTION public.responder_entrada_sala(p_participante_id uuid, p_aprovar boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$

