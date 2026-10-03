-- 1) Config: quantos meses pra frente o link mostra (1 = só mês atual)
ALTER TABLE public.agenda_config_tenant
  ADD COLUMN IF NOT EXISTS meses_a_frente integer NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agenda_config_meses_chk') THEN
    ALTER TABLE public.agenda_config_tenant
      ADD CONSTRAINT agenda_config_meses_chk CHECK (meses_a_frente BETWEEN 1 AND 12);
  END IF;
END $$;

-- 2) RPC pública: range por MESES (não mais por dias fixos). Devolve slots do
--    intervalo [hoje, fim do mês limite] + meses_a_frente + limite + branding.
DROP FUNCTION IF EXISTS public.obter_agenda_publica(uuid, integer);

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

  -- Branding automático (zero config na agenda)
  SELECT cc.logo_url, cc.nome_empresa, cc.cor_pagina INTO v_logo, v_nome, v_cor
  FROM public.config_contrato cc WHERE cc.tenant_id = v_reg.tenant_id;
  SELECT ct.banner_url INTO v_banner
  FROM public.consultas_config_tenant ct WHERE ct.tenant_id = v_reg.tenant_id;
  IF v_nome IS NULL THEN
    SELECT e.nome INTO v_nome FROM public.empresas e WHERE e.user_id = v_reg.tenant_id LIMIT 1;
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
$function$;

GRANT EXECUTE ON FUNCTION public.obter_agenda_publica(uuid) TO anon, authenticated;

-- 3) Confirmação: incluir o MOTIVO no título da reunião (aparece na agenda do tenant)
CREATE OR REPLACE FUNCTION public.confirmar_agendamento_publico(p_token uuid, p_inicio timestamp with time zone, p_dados jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_reg public.agendamentos_link%ROWTYPE;
  v_res jsonb;
  v_nome text;
  v_motivo text;
  v_titulo text;
BEGIN
  IF p_token IS NULL OR p_inicio IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'token_e_inicio_obrigatorios');
  END IF;
  PERFORM public.verificar_limite_taxa_publico(p_token::text, 'confirmar_agendamento_publico', 10);

  SELECT * INTO v_reg FROM public.agendamentos_link WHERE chave_publica = p_token FOR UPDATE;
  IF v_reg.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'nao_encontrado');
  END IF;
  IF v_reg.status = 'agendado' THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'ja_agendado');
  END IF;

  v_nome   := COALESCE(NULLIF(btrim(p_dados->>'nome'), ''), 'Contato');
  v_motivo := NULLIF(btrim(p_dados->>'motivo'), '');
  v_titulo := 'Reunião — ' || v_nome;
  IF v_motivo IS NOT NULL THEN
    v_titulo := v_titulo || ': ' || v_motivo;
  END IF;

  v_res := public.agendar_reuniao_lead(
    v_reg.tenant_id, v_reg.conversa_id, v_reg.lead_id, v_reg.agente_id,
    p_inicio, v_titulo
  );
  IF (v_res->>'ok')::boolean IS DISTINCT FROM true THEN
    RETURN v_res;
  END IF;

  UPDATE public.agendamentos_link
     SET status = 'agendado',
         dados_cliente = COALESCE(p_dados, '{}'::jsonb),
         scheduled_at = p_inicio,
         sala_reuniao_id = (v_res->>'sala_id')::uuid,
         compromisso_id = (v_res->>'compromisso_id')::uuid,
         updated_at = now()
   WHERE id = v_reg.id;

  RETURN jsonb_build_object(
    'ok', true,
    'scheduled_at', p_inicio,
    'link_sala', '/sala/' || (v_res->>'chave_publica')
  );
END;
$function$;
;
