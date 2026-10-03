CREATE OR REPLACE FUNCTION public.criar_sala_agora(p_titulo text, p_max integer DEFAULT 6, p_exige_aprovacao boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$

