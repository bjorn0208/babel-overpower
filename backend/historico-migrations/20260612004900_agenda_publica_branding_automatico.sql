-- Branding do link de agendamento 100% AUTOMÁTICO (ordem Theus 2026-06-11):
-- logo/nome/cor vêm da config_contrato (mesma identidade dos links de contrato);
-- banner vem da consultas_config_tenant; nome cai pra empresas.nome se faltar.
-- As 4 colunas de branding criadas hoje na agenda_config_tenant saem (nada mais usa).

CREATE OR REPLACE FUNCTION public.obter_agenda_publica(p_token uuid, p_dias integer DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reg public.agendamentos_link%ROWTYPE;
  v_cfg public.agenda_config_tenant%ROWTYPE;
  v_logo text;
  v_nome text;
  v_cor text;
  v_banner text;
  v_slots jsonb := '[]'::jsonb;
  v_dia date;
  v_i integer;
  v_sala uuid;
BEGIN
  IF p_token IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'token_obrigatorio');
  END IF;
  SELECT * INTO v_reg FROM public.agendamentos_link WHERE chave_publica = p_token;
  IF v_reg.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'nao_encontrado');
  END IF;
  SELECT * INTO v_cfg FROM public.agenda_config_tenant WHERE tenant_id = v_reg.tenant_id;

  -- Branding automático (zero config na agenda)
  SELECT cc.logo_url, cc.nome_empresa, cc.cor_pagina INTO v_logo, v_nome, v_cor
  FROM public.config_contrato cc WHERE cc.tenant_id = v_reg.tenant_id;
  SELECT ct.banner_url INTO v_banner
  FROM public.consultas_config_tenant ct WHERE ct.tenant_id = v_reg.tenant_id;
  IF v_nome IS NULL THEN
    SELECT e.nome INTO v_nome FROM public.empresas e WHERE e.user_id = v_reg.tenant_id LIMIT 1;
  END IF;
  v_nome := COALESCE(v_nome, 'Agendamento');

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

  FOR v_i IN 0..LEAST(GREATEST(p_dias, 1), 14) - 1 LOOP
    v_dia := ((now() AT TIME ZONE 'America/Sao_Paulo')::date + v_i);
    v_slots := v_slots || COALESCE((
      SELECT jsonb_agg(jsonb_build_object('inicio', s.slot_inicio))
      FROM public.slots_disponiveis(v_reg.tenant_id, v_dia) s
      WHERE s.slot_inicio > now()
    ), '[]'::jsonb);
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true, 'status', 'pendente',
    'slots', v_slots,
    'duracao_min', COALESCE(v_cfg.duracao_padrao_min, 30),
    'nome_exibicao', v_nome, 'logo_url', v_logo, 'banner_url', v_banner, 'cor_pagina', v_cor
  );
END;
$$;

ALTER TABLE public.agenda_config_tenant DROP COLUMN IF EXISTS logo_url;
ALTER TABLE public.agenda_config_tenant DROP COLUMN IF EXISTS banner_url;
ALTER TABLE public.agenda_config_tenant DROP COLUMN IF EXISTS cor_pagina;
ALTER TABLE public.agenda_config_tenant DROP COLUMN IF EXISTS nome_exibicao;
;
