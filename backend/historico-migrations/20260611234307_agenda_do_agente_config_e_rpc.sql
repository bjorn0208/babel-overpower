-- Agenda do agente (2026-06-11): config por tenant (toggle + lembrete) + RPC server-side
-- que agenda reunião pro LEAD (sala do app Reunião + evento na agenda + compromisso + lembrete).
-- A RPC `agendar_reuniao` existente exige auth.uid() (botão do tenant) — o agente roda com
-- service_role, por isso esta variante recebe o contexto explícito (mesmo padrão da gerar_link_consulta).

-- 1. Config
CREATE TABLE IF NOT EXISTS public.agenda_config_tenant (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id),
  agente_pode_agendar boolean NOT NULL DEFAULT false,
  duracao_padrao_min integer NOT NULL DEFAULT 30,
  -- lembrete: { modo: 'desativado'|'horas'|'dias', quantidade: int }
  lembrete jsonb NOT NULL DEFAULT '{"modo":"horas","quantidade":2}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agenda_config_tenant_tenant_idx ON public.agenda_config_tenant (tenant_id);

ALTER TABLE public.agenda_config_tenant ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'agenda_config_tenant' AND policyname = 'tenant_agenda_config') THEN
    CREATE POLICY "tenant_agenda_config" ON public.agenda_config_tenant
      FOR ALL TO authenticated
      USING (tenant_id = (SELECT auth.uid()))
      WITH CHECK (tenant_id = (SELECT auth.uid()));
  END IF;
END $$;

-- 2. RLS na disponibilidade (tabela já existia sem policy de tenant — agora a aba Agente edita)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'disponibilidade' AND policyname = 'tenant_disponibilidade') THEN
    ALTER TABLE public.disponibilidade ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "tenant_disponibilidade" ON public.disponibilidade
      FOR ALL TO authenticated
      USING (tenant_id = (SELECT auth.uid()))
      WITH CHECK (tenant_id = (SELECT auth.uid()));
  END IF;
END $$;

-- 3. RPC do agente
CREATE OR REPLACE FUNCTION public.agendar_reuniao_lead(
  p_tenant_id uuid,
  p_conversa_id uuid,
  p_lead_id uuid,
  p_agente_id uuid,
  p_inicio timestamptz,
  p_titulo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
  INSERT INTO public.eventos_agenda (tenant_id, criado_por, titulo, tipo, inicio_em, fim_em, sala_reuniao_id, cor)
  VALUES (p_tenant_id, p_tenant_id, v_titulo, 'reuniao', p_inicio, p_inicio + (v_dur || ' minutes')::interval, v_sala_id, 'azul')
  RETURNING id INTO v_evento_id;

  -- Compromisso vinculado ao lead (anti-overbooking do slots_disponiveis + dossiê)
  INSERT INTO public.compromissos (conversation_id, lead_id, tenant_id, descricao, scheduled_at, origem, criado_por, status, duracao_min, link_call, lembretes_config)
  VALUES (p_conversa_id, p_lead_id, p_tenant_id, v_titulo, p_inicio, 'agente', 'agente', 'pendente', v_dur,
          '/sala/' || v_chave::text, v_cfg.lembrete)
  RETURNING id INTO v_compromisso_id;

  -- Lembrete pro lead (acoes_agendadas → processar-acompanhamentos → [LEMBRETE_REUNIAO])
  v_modo := COALESCE(v_cfg.lembrete->>'modo', 'desativado');
  v_qtd  := GREATEST(COALESCE((v_cfg.lembrete->>'quantidade')::int, 0), 0);
  IF v_modo IN ('horas','dias') AND v_qtd > 0 AND p_conversa_id IS NOT NULL THEN
    v_lembrete_em := p_inicio - (v_qtd || CASE WHEN v_modo = 'dias' THEN ' days' ELSE ' hours' END)::interval;
    IF v_lembrete_em > now() THEN
      INSERT INTO public.acoes_agendadas (conversation_id, agente_id, lead_id, tenant_id, action_type, scheduled_at, status, carga)
      VALUES (p_conversa_id, p_agente_id, p_lead_id, p_tenant_id, 'lembrete_reuniao', v_lembrete_em, 'pendente',
              jsonb_build_object('titulo', v_titulo, 'reuniao_em', p_inicio, 'link_sala', '/sala/' || v_chave::text,
                                 'compromisso_id', v_compromisso_id, 'origem', 'agendar_reuniao_lead'));
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
    'lembrete_em', v_lembrete_em
  );
END;
$$;
;
