CREATE OR REPLACE FUNCTION public.obter_agenda_publica(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_reg public.agendamentos_link%ROWTYPE;
  v_cfg public.agenda_config_tenant%ROWTYPE;
  v_logo text; v_nome text; v_cor text; v_banner text;
  v_slots jsonb := '[]'::jsonb;
  v_hoje date; v_limite date; v_dia date;
  v_meses integer; v_sala uuid;
BEGIN
  IF p_token IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'token_obrigatorio');
  END IF;
  SELECT * INTO v_reg FROM public.agendamentos_link WHERE chave_publica = p_token;
  IF v_reg.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'nao_encontrado');
  END IF;
  SELECT * INTO v_cfg FROM public.agenda_config_tenant WHERE tenant_id = v_reg.tenant_id;

  -- Branding: empresas (ficha viva) manda; config_contrato/consultas_config_tenant = fallback.
  SELECT e.logo_url, e.nome, e.banner_url INTO v_logo, v_nome, v_banner
  FROM public.empresas e WHERE e.user_id = v_reg.tenant_id LIMIT 1;
  SELECT cc.cor_pagina INTO v_cor
  FROM public.config_contrato cc WHERE cc.tenant_id = v_reg.tenant_id;
  IF v_logo IS NULL THEN
    SELECT cc.logo_url INTO v_logo FROM public.config_contrato cc WHERE cc.tenant_id = v_reg.tenant_id;
  END IF;
  IF v_nome IS NULL THEN
    SELECT cc.nome_empresa INTO v_nome FROM public.config_contrato cc WHERE cc.tenant_id = v_reg.tenant_id;
  END IF;
  IF v_banner IS NULL THEN
    SELECT ct.banner_url INTO v_banner FROM public.consultas_config_tenant ct WHERE ct.tenant_id = v_reg.tenant_id;
  END IF;
  v_nome := COALESCE(v_nome, 'Agendamento');

  -- Já agendado: devolve tela de sucesso
  IF v_reg.status = 'agendado' THEN
    SELECT s.chave_publica INTO v_sala FROM public.salas_reuniao s WHERE s.id = v_reg.sala_reuniao_id;
    RETURN jsonb_build_object(
      'ok', true, 'status', 'agendado',
      'scheduled_at', v_reg.scheduled_at,
      'link_sala', '/sala/' || COALESCE(v_sala::text, ''),
      'nome_exibicao', v_nome, 'logo_url', v_logo, 'banner_url', v_banner, 'cor_pagina', v_cor
    );
  END IF;

  IF v_cfg.id IS NULL OR v_cfg.agente_pode_agendar IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'agenda_indisponivel');
  END IF;

  v_meses  := LEAST(GREATEST(COALESCE(v_cfg.meses_a_frente, 1), 1), 12);
  v_hoje   := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_limite := (date_trunc('month', v_hoje) + (v_meses || ' months')::interval - interval '1 day')::date;

  v_dia := v_hoje;
  WHILE v_dia <= v_limite LOOP
    v_slots := v_slots || COALESCE((
      SELECT jsonb_agg(s.slot_inicio ORDER BY s.slot_inicio)
      FROM public.slots_disponiveis(v_reg.tenant_id, v_dia) s
      WHERE s.slot_inicio > now()
    ), '[]'::jsonb);
    v_dia := v_dia + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true, 'status', 'pendente',
    'slots', v_slots,
    'duracao_min', COALESCE(v_cfg.duracao_padrao_min, 30),
    'meses_a_frente', v_meses,
    'limite', v_limite,
    'nome_exibicao', v_nome, 'logo_url', v_logo, 'banner_url', v_banner, 'cor_pagina', v_cor
  );
END;
$function$

