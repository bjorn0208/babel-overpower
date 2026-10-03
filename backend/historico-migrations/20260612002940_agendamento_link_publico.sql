-- Link público de agendamento (2026-06-11): o agente envia o LINK; o contato escolhe o slot
-- na página (só horários livres aparecem), preenche dados e recebe o link da sala do app Reunião.

-- 1. Branding na config
ALTER TABLE public.agenda_config_tenant ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE public.agenda_config_tenant ADD COLUMN IF NOT EXISTS banner_url text;
ALTER TABLE public.agenda_config_tenant ADD COLUMN IF NOT EXISTS cor_pagina text;
ALTER TABLE public.agenda_config_tenant ADD COLUMN IF NOT EXISTS nome_exibicao text;

-- 2. Registro do link (1 por envio do agente; vínculo lead/conversa pro lembrete cair na conversa certa)
CREATE TABLE IF NOT EXISTS public.agendamentos_link (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.profiles(id),
  lead_id uuid,
  conversa_id uuid,
  agente_id uuid,
  chave_publica uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','agendado','cancelado')),
  dados_cliente jsonb NOT NULL DEFAULT '{}'::jsonb,
  scheduled_at timestamptz,
  sala_reuniao_id uuid,
  compromisso_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agendamentos_link_tenant_idx ON public.agendamentos_link (tenant_id);
CREATE INDEX IF NOT EXISTS agendamentos_link_chave_idx ON public.agendamentos_link (chave_publica);
CREATE INDEX IF NOT EXISTS agendamentos_link_lead_idx ON public.agendamentos_link (lead_id);

ALTER TABLE public.agendamentos_link ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'agendamentos_link' AND policyname = 'tenant_agendamentos_link') THEN
    CREATE POLICY "tenant_agendamentos_link" ON public.agendamentos_link
      FOR ALL TO authenticated
      USING (tenant_id = (SELECT auth.uid()))
      WITH CHECK (tenant_id = (SELECT auth.uid()));
  END IF;
END $$;

-- 3. RPC pública: dados da página (branding + slots livres dos próximos dias)
CREATE OR REPLACE FUNCTION public.obter_agenda_publica(p_token uuid, p_dias integer DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reg public.agendamentos_link%ROWTYPE;
  v_cfg public.agenda_config_tenant%ROWTYPE;
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

  -- Já agendado → devolve a confirmação (página reaberta mostra o resultado, não o calendário)
  IF v_reg.status = 'agendado' THEN
    SELECT s.chave_publica INTO v_sala FROM public.salas_reuniao s WHERE s.id = v_reg.sala_reuniao_id;
    RETURN jsonb_build_object(
      'ok', true, 'status', 'agendado',
      'scheduled_at', v_reg.scheduled_at,
      'link_sala', '/sala/' || COALESCE(v_sala::text, ''),
      'nome_exibicao', COALESCE(v_cfg.nome_exibicao, 'Agendamento'),
      'logo_url', v_cfg.logo_url, 'banner_url', v_cfg.banner_url, 'cor_pagina', v_cfg.cor_pagina
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
    'nome_exibicao', COALESCE(v_cfg.nome_exibicao, 'Agendamento'),
    'logo_url', v_cfg.logo_url, 'banner_url', v_cfg.banner_url, 'cor_pagina', v_cfg.cor_pagina
  );
END;
$$;

-- 4. RPC pública: confirmar o agendamento (valida slot de novo → cria a cadeia → grava no registro)
CREATE OR REPLACE FUNCTION public.confirmar_agendamento_publico(p_token uuid, p_inicio timestamptz, p_dados jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reg public.agendamentos_link%ROWTYPE;
  v_res jsonb;
  v_nome text;
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

  v_nome := COALESCE(NULLIF(btrim(p_dados->>'nome'), ''), 'Contato');
  v_res := public.agendar_reuniao_lead(
    v_reg.tenant_id, v_reg.conversa_id, v_reg.lead_id, v_reg.agente_id,
    p_inicio, 'Reunião — ' || v_nome
  );
  IF (v_res->>'ok')::boolean IS DISTINCT FROM true THEN
    RETURN v_res; -- horario_indisponivel / agenda_desativada etc.
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
$$;

GRANT EXECUTE ON FUNCTION public.obter_agenda_publica(uuid, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirmar_agendamento_publico(uuid, timestamptz, jsonb) TO anon, authenticated;
;
