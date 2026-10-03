CREATE OR REPLACE FUNCTION public.agendar_reuniao_lead(p_tenant_id uuid, p_conversa_id uuid, p_lead_id uuid, p_agente_id uuid, p_inicio timestamp with time zone, p_titulo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_cfg public.agenda_config_tenant%ROWTYPE;
  v_dur integer;
  v_titulo text;
  v_sala_id uuid;
  v_chave uuid;
  v_evento_id uuid;
  v_compromisso_id uuid;
  v_tem_disp boolean;
  v_slot_ok boolean := true;
  v_lembrete_em timestamptz := NULL;
  v_modo text;
  v_qtd integer;
  v_item jsonb;
  v_lembretes jsonb := '[]'::jsonb;
BEGIN
  IF p_tenant_id IS NULL OR p_inicio IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'tenant e inicio obrigatórios');
  END IF;
  IF p_inicio <= now() THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'horario_no_passado');
  END IF;

  SELECT * INTO v_cfg FROM public.agenda_config_tenant WHERE tenant_id = p_tenant_id;
  IF v_cfg.id IS NULL OR v_cfg.agente_pode_agendar IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'agenda_desativada_pro_agente');
  END IF;
  v_dur := COALESCE(v_cfg.duracao_padrao_min, 30);
  v_titulo := COALESCE(NULLIF(btrim(p_titulo), ''), 'Reunião');

  -- Horário precisa bater num slot livre QUANDO o tenant configurou disponibilidade.
  SELECT EXISTS (SELECT 1 FROM public.disponibilidade d WHERE d.tenant_id = p_tenant_id AND d.ativo = true)
    INTO v_tem_disp;
  IF v_tem_disp THEN
    SELECT EXISTS (
      SELECT 1 FROM public.slots_disponiveis(p_tenant_id, (p_inicio AT TIME ZONE 'America/Sao_Paulo')::date)
      WHERE slot_inicio = p_inicio
    ) INTO v_slot_ok;
    IF NOT v_slot_ok THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'horario_indisponivel');
    END IF;
  END IF;

  -- Sala do app Reunião (link público /sala/{chave})
  INSERT INTO public.salas_reuniao (tenant_id, criada_por, titulo, status, max_participantes, agendada_para, duracao_min, exige_aprovacao)
  VALUES (p_tenant_id, p_tenant_id, v_titulo, 'agendada', 6, p_inicio, v_dur, false)
  RETURNING id, chave_publica INTO v_sala_id, v_chave;

  -- Evento na agenda do tenant
  INSERT INTO public.eventos_agenda (tenant_id, criado_por, titulo, tipo, inicio_em, fim_em, sala_reuniao_id, cor, origem)
  VALUES (p_tenant_id, p_tenant_id, v_titulo, 'reuniao', p_inicio, p_inicio + (v_dur || ' minutes')::interval, v_sala_id, 'azul', 'agente')
  RETURNING id INTO v_evento_id;

  -- Compromisso vinculado ao lead (anti-overbooking do slots_disponiveis + dossiê)
  INSERT INTO public.compromissos (conversation_id, lead_id, tenant_id, descricao, scheduled_at, origem, criado_por, status, duracao_min, link_call, lembretes_config)
  VALUES (p_conversa_id, p_lead_id, p_tenant_id, v_titulo, p_inicio, 'combinado', p_tenant_id, 'pendente', v_dur,
          '/sala/' || v_chave::text, v_cfg.lembrete)
  RETURNING id INTO v_compromisso_id;

  -- Lembretes pro lead (acoes_agendadas → processar-acompanhamentos → [LEMBRETE_REUNIAO]).
  IF p_conversa_id IS NOT NULL THEN
    IF jsonb_typeof(v_cfg.lembrete->'multiplos') = 'array' THEN
      -- Config nova: N lembretes independentes (dias/horas/minutos antes).
      FOR v_item IN SELECT * FROM jsonb_array_elements(v_cfg.lembrete->'multiplos') LOOP
        v_modo := COALESCE(v_item->>'modo', '');
        v_qtd  := GREATEST(COALESCE((v_item->>'quantidade')::int, 0), 0);
        IF v_modo IN ('minutos','horas','dias') AND v_qtd > 0 THEN
          v_lembrete_em := p_inicio - (v_qtd || CASE v_modo WHEN 'dias' THEN ' days' WHEN 'horas' THEN ' hours' ELSE ' minutes' END)::interval;
          IF v_lembrete_em > now() THEN
            INSERT INTO public.acoes_agendadas (conversation_id, agente_id, lead_id, tenant_id, action_type, scheduled_at, status, carga)
            VALUES (p_conversa_id, p_agente_id, p_lead_id, p_tenant_id, 'lembrete_reuniao', v_lembrete_em, 'pendente',
                    jsonb_build_object('titulo', v_titulo, 'reuniao_em', p_inicio, 'link_sala', '/sala/' || v_chave::text,
                                       'compromisso_id', v_compromisso_id, 'origem', 'agendar_reuniao_lead'));
            v_lembretes := v_lembretes || to_jsonb(v_lembrete_em);
          END IF;
        END IF;
      END LOOP;
      -- Informativo do retorno: o primeiro disparo (mais distante da reunião).
      SELECT min(x::timestamptz) INTO v_lembrete_em FROM jsonb_array_elements_text(v_lembretes) x;
    ELSE
      -- Config legada: um único lembrete modo/quantidade.
      v_modo := COALESCE(v_cfg.lembrete->>'modo', 'desativado');
      v_qtd  := GREATEST(COALESCE((v_cfg.lembrete->>'quantidade')::int, 0), 0);
      IF v_modo IN ('horas','dias') AND v_qtd > 0 THEN
        v_lembrete_em := p_inicio - (v_qtd || CASE WHEN v_modo = 'dias' THEN ' days' ELSE ' hours' END)::interval;
        IF v_lembrete_em > now() THEN
          INSERT INTO public.acoes_agendadas (conversation_id, agente_id, lead_id, tenant_id, action_type, scheduled_at, status, carga)
          VALUES (p_conversa_id, p_agente_id, p_lead_id, p_tenant_id, 'lembrete_reuniao', v_lembrete_em, 'pendente',
                  jsonb_build_object('titulo', v_titulo, 'reuniao_em', p_inicio, 'link_sala', '/sala/' || v_chave::text,
                                     'compromisso_id', v_compromisso_id, 'origem', 'agendar_reuniao_lead'));
          v_lembretes := v_lembretes || to_jsonb(v_lembrete_em);
        ELSE
          v_lembrete_em := NULL;
        END IF;
      ELSE
        v_lembrete_em := NULL;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'chave_publica', v_chave,
    'sala_id', v_sala_id,
    'evento_id', v_evento_id,
    'compromisso_id', v_compromisso_id,
    'inicio', p_inicio,
    'duracao_min', v_dur,
    'lembrete_em', v_lembrete_em,
    'lembretes', v_lembretes
  );
END;
$function$

