-- Adiciona o tipo 'compromisso' aos eventos que o usuário/equipe pode criar na Agenda.
ALTER TABLE public.eventos_agenda DROP CONSTRAINT IF EXISTS eventos_agenda_tipo_check;
ALTER TABLE public.eventos_agenda ADD CONSTRAINT eventos_agenda_tipo_check
  CHECK (tipo = ANY (ARRAY['reuniao'::text, 'tarefa'::text, 'lembrete'::text, 'outro'::text, 'compromisso'::text]));

-- RPC: aceitar 'compromisso' na validação de tipo.
CREATE OR REPLACE FUNCTION public.criar_evento_agenda(p_titulo text, p_inicio_em timestamp with time zone, p_tipo text DEFAULT 'outro'::text, p_fim_em timestamp with time zone DEFAULT NULL::timestamp with time zone, p_descricao text DEFAULT NULL::text, p_dia_inteiro boolean DEFAULT false, p_cor text DEFAULT 'azul'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if p_tipo not in ('reuniao','tarefa','lembrete','outro','compromisso') then
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
$function$;
;
