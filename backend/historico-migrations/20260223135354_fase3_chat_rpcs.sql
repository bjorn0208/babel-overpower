
-- RPC 1: load_agent_context — consolida agent + tenant + empresa_nome + subscription
CREATE OR REPLACE FUNCTION public.load_agent_context(p_agent_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT jsonb_build_object(
    'agent', jsonb_build_object(
      'id', t.id,
      'identidade', t.identidade,
      'fluxo', t.fluxo,
      'configuracao', t.configuracao,
      'modelo_principal', t.modelo_principal,
      'temperatura', t.temperatura,
      'max_tokens', t.max_tokens
    ),
    'tenant_id', ua.user_id,
    'empresa_nome', COALESCE(e.nome, ''),
    'subscription', CASE WHEN s.id IS NOT NULL THEN jsonb_build_object(
      'id', s.id,
      'status', s.status,
      'max_conversas', s.max_conversas,
      'conversas_usadas', s.conversas_usadas,
      'plano_id', s.plano_id
    ) ELSE NULL END
  )
  FROM agent_templates t
  LEFT JOIN user_agents ua ON ua.template_id = t.id
  LEFT JOIN empresas e ON e.user_id = ua.user_id
  LEFT JOIN user_subscriptions s ON s.user_id = ua.user_id AND s.status = 'active'
  WHERE t.id = p_agent_id
  LIMIT 1;
$$;

-- RPC 2: get_or_create_conversation — busca ou cria conversa + lead + lead_card
CREATE OR REPLACE FUNCTION public.get_or_create_conversation(
  p_phone text,
  p_tenant_id uuid,
  p_agent_id uuid,
  p_channel text DEFAULT 'chat',
  p_first_fase text DEFAULT 'inicio'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv record;
  v_lead_id uuid;
  v_ficha record;
  v_result jsonb;
BEGIN
  -- Buscar conversa ativa
  SELECT * INTO v_conv
  FROM conversations
  WHERE phone = p_phone AND tenant_id IS NOT DISTINCT FROM p_tenant_id AND status = 'active'
  ORDER BY created_at DESC
  LIMIT 1;

  -- Criar se não existe
  IF v_conv IS NULL THEN
    INSERT INTO leads (agent_id, phone, name, external_channel, tenant_id)
    VALUES (p_agent_id, p_phone, p_phone, p_channel, p_tenant_id)
    RETURNING id INTO v_lead_id;

    INSERT INTO conversations (lead_id, phone, status, channel, tenant_id)
    VALUES (v_lead_id, p_phone, 'active', p_channel, p_tenant_id)
    RETURNING * INTO v_conv;
  END IF;

  -- Buscar ou criar lead_card
  SELECT * INTO v_ficha FROM lead_cards WHERE conversation_id = v_conv.id LIMIT 1;

  IF v_ficha IS NULL THEN
    INSERT INTO lead_cards (conversation_id, lead_id, agent_id, fase, ciclo, dados_capturados, resumo, historico_fases)
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

-- RPC 3: save_turn_results — salva msgs + atualiza lead_card + usage numa transação
CREATE OR REPLACE FUNCTION public.save_turn_results(
  p_conversation_id uuid,
  p_lead_card_id uuid,
  p_user_message text,
  p_agent_messages text[],
  p_ciclo integer,
  p_fase text,
  p_dados_capturados jsonb,
  p_resumo text,
  p_historico_fases text[],
  p_tenant_id uuid DEFAULT NULL,
  p_model text DEFAULT '',
  p_prompt_tokens integer DEFAULT 0,
  p_completion_tokens integer DEFAULT 0,
  p_cost_usd numeric DEFAULT 0,
  p_latency_ms integer DEFAULT 0,
  p_media_url text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_msg text;
  v_payload jsonb;
BEGIN
  -- Salvar msg usuario
  v_payload := CASE WHEN p_media_url IS NOT NULL THEN jsonb_build_object('media_url', p_media_url) ELSE NULL END;
  INSERT INTO messages (conversation_id, role, content, payload)
  VALUES (p_conversation_id, 'user', p_user_message, v_payload);

  -- Salvar msgs agente
  FOREACH v_msg IN ARRAY p_agent_messages LOOP
    INSERT INTO messages (conversation_id, role, content) VALUES (p_conversation_id, 'assistant', v_msg);
  END LOOP;

  -- Atualizar lead_card
  UPDATE lead_cards SET
    ciclo = p_ciclo,
    fase = p_fase,
    dados_capturados = p_dados_capturados,
    resumo = p_resumo,
    historico_fases = p_historico_fases,
    updated_at = now()
  WHERE id = p_lead_card_id;

  -- Usage tracking
  IF p_prompt_tokens > 0 THEN
    INSERT INTO api_usage_logs (tenant_id, model, prompt_tokens, completion_tokens, total_tokens, cost_usd, conversation_id)
    VALUES (p_tenant_id, p_model, p_prompt_tokens, p_completion_tokens, p_prompt_tokens + p_completion_tokens, p_cost_usd, p_conversation_id);

    INSERT INTO llm_request_logs (model_slug, provider_nome, tokens_input, tokens_output, custo_total, tipo, status, duracao_ms)
    VALUES (p_model, 'openrouter', p_prompt_tokens, p_completion_tokens, p_cost_usd, 'chat', 'success', p_latency_ms);
  END IF;
END;
$$;

;
