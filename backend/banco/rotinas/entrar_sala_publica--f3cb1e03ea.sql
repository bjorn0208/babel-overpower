CREATE OR REPLACE FUNCTION public.entrar_sala_publica(p_chave uuid, p_nome text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$

