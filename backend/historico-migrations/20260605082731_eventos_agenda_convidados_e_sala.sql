-- 1. Convidados do evento (contatos/leads + membros da equipe) como jsonb array.
ALTER TABLE public.eventos_agenda
  ADD COLUMN IF NOT EXISTS convidados jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.eventos_agenda DROP CONSTRAINT IF EXISTS eventos_agenda_convidados_check;
ALTER TABLE public.eventos_agenda ADD CONSTRAINT eventos_agenda_convidados_check
  CHECK (jsonb_typeof(convidados) = 'array');

-- 2. RPC estendida: cria opcionalmente a sala do app Reunião (tipo='reuniao') e grava convidados.
--    DROP da versão antiga (7 args) pra não criar overload.
DROP FUNCTION IF EXISTS public.criar_evento_agenda(text, timestamptz, text, timestamptz, text, boolean, text);

CREATE OR REPLACE FUNCTION public.criar_evento_agenda(
  p_titulo text,
  p_inicio_em timestamp with time zone,
  p_tipo text DEFAULT 'outro'::text,
  p_fim_em timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_descricao text DEFAULT NULL::text,
  p_dia_inteiro boolean DEFAULT false,
  p_cor text DEFAULT 'azul'::text,
  p_convidados jsonb DEFAULT '[]'::jsonb,
  p_criar_sala boolean DEFAULT false
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_tenant uuid;
  v_id uuid;
  v_sala_id uuid := null;
  v_teto integer;
  v_max integer;
  v_dur integer;
  v_convidados jsonb := coalesce(p_convidados, '[]'::jsonb);
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
  if jsonb_typeof(v_convidados) <> 'array' then
    raise exception 'convidados_invalido';
  end if;

  select coalesce(p.parent_user_id, p.id) into v_tenant
    from public.profiles p where p.id = v_uid;
  if v_tenant is null then
    v_tenant := v_uid;
  end if;

  -- Sala do app Reunião só quando explicitamente pedida e o evento é reunião.
  if coalesce(p_criar_sala, false) and p_tipo = 'reuniao' then
    select coalesce(reuniao_limite_participantes, 6) into v_teto from public.config_plataforma limit 1;
    if v_teto is null then v_teto := 6; end if;
    v_max := least(greatest(6, 2), v_teto);
    v_dur := coalesce(
      nullif(floor(extract(epoch from (p_fim_em - p_inicio_em)) / 60)::int, 0),
      60
    );
    if v_dur < 1 then v_dur := 60; end if;
    insert into public.salas_reuniao (tenant_id, criada_por, titulo, status, max_participantes, agendada_para, duracao_min)
      values (v_tenant, v_uid, btrim(p_titulo), 'agendada', v_max, p_inicio_em, v_dur)
      returning id into v_sala_id;
  end if;

  insert into public.eventos_agenda (tenant_id, criado_por, titulo, descricao, tipo, inicio_em, fim_em, dia_inteiro, cor, sala_reuniao_id, convidados)
    values (v_tenant, v_uid, btrim(p_titulo), p_descricao, p_tipo, p_inicio_em, p_fim_em,
            coalesce(p_dia_inteiro, false), coalesce(nullif(btrim(p_cor),''),'azul'), v_sala_id, v_convidados)
    returning id into v_id;

  return v_id;
end;
$function$;
;
