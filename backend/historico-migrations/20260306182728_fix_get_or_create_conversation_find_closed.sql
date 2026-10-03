
CREATE OR REPLACE FUNCTION public.get_or_create_conversation(
  p_phone text,
  p_tenant_id uuid,
  p_agent_id uuid,
  p_channel text DEFAULT 'chat',
  p_first_fase text DEFAULT 'saudacao'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_conv record;
  v_lead_id uuid;
  v_ficha record;
  v_lead_converted boolean;
BEGIN
  -- Lock por phone+tenant pra evitar race condition
  PERFORM pg_advisory_xact_lock(hashtext(p_phone || COALESCE(p_tenant_id::text, '')));

  -- 1) Buscar conversa ativa
  SELECT * INTO v_conv
  FROM public.conversations
  WHERE phone = p_phone AND tenant_id IS NOT DISTINCT FROM p_tenant_id AND status = 'active'
  ORDER BY created_at DESC
  LIMIT 1;

  -- 2) Fallback: buscar conversa fechada/humana recente (evita criar duplicata)
  IF v_conv IS NULL THEN
    SELECT * INTO v_conv
    FROM public.conversations
    WHERE phone = p_phone AND tenant_id IS NOT DISTINCT FROM p_tenant_id
      AND status IN ('human', 'closed')
      AND created_at > now() - interval '30 days'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_conv IS NOT NULL THEN
      UPDATE public.conversations SET status = 'active' WHERE id = v_conv.id RETURNING * INTO v_conv;
    END IF;
  END IF;

  -- 3) Checar se lead é cliente convertido → forçar agent_enabled=false
  IF v_conv IS NOT NULL THEN
    SELECT (converted_at IS NOT NULL) INTO v_lead_converted
    FROM public.leads WHERE id = v_conv.lead_id;

    IF v_lead_converted AND v_conv.agent_enabled = true THEN
      UPDATE public.conversations SET agent_enabled = false WHERE id = v_conv.id;
      v_conv.agent_enabled := false;
    END IF;
  END IF;

  -- 4) Criar se nao existe
  IF v_conv IS NULL THEN
    -- Reusar lead existente pro mesmo phone+tenant (evita duplicatas)
    SELECT id INTO v_lead_id
    FROM public.leads
    WHERE phone = p_phone AND tenant_id IS NOT DISTINCT FROM p_tenant_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_lead_id IS NULL THEN
      INSERT INTO public.leads (agent_id, phone, name, external_channel, tenant_id)
      VALUES (p_agent_id, p_phone, p_phone, p_channel, p_tenant_id)
      RETURNING id INTO v_lead_id;
    END IF;

    -- Checar se lead é cliente convertido
    SELECT (converted_at IS NOT NULL) INTO v_lead_converted
    FROM public.leads WHERE id = v_lead_id;

    INSERT INTO public.conversations (lead_id, phone, status, channel, tenant_id, agent_enabled)
    VALUES (v_lead_id, p_phone, 'active', p_channel, p_tenant_id, NOT COALESCE(v_lead_converted, false))
    RETURNING * INTO v_conv;
  END IF;

  -- Buscar ou criar lead_card
  SELECT * INTO v_ficha FROM public.lead_cards WHERE conversation_id = v_conv.id LIMIT 1;

  IF v_ficha IS NULL THEN
    INSERT INTO public.lead_cards (conversation_id, lead_id, agent_id, fase, ciclo, dados_capturados, resumo, historico_fases)
    VALUES (v_conv.id, v_conv.lead_id, p_agent_id, p_first_fase, 0, '{}'::jsonb, '', ARRAY[p_first_fase])
    RETURNING * INTO v_ficha;
  END IF;

  RETURN jsonb_build_object(
    'conversation', jsonb_build_object(
      'id', v_conv.id,
      'lead_id', v_conv.lead_id,
      'phone', v_conv.phone,
      'status', v_conv.status,
      'agent_enabled', v_conv.agent_enabled,
      'channel', v_conv.channel,
      'tenant_id', v_conv.tenant_id
    ),
    'lead_card', jsonb_build_object(
      'id', v_ficha.id,
      'fase', v_ficha.fase,
      'ciclo', v_ficha.ciclo,
      'dados_capturados', v_ficha.dados_capturados,
      'resumo', v_ficha.resumo,
      'historico_fases', to_jsonb(v_ficha.historico_fases),
      'proximo_esperado', v_ficha.proximo_esperado
    )
  );
END;
$$;

;
