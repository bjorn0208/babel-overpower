
CREATE OR REPLACE FUNCTION save_turn_results(
  p_conversation_id UUID,
  p_lead_card_id UUID,
  p_user_message TEXT,
  p_agent_messages TEXT[],
  p_ciclo INTEGER,
  p_fase TEXT,
  p_dados_capturados JSONB,
  p_resumo TEXT,
  p_historico_fases TEXT[],
  p_tenant_id UUID,
  p_model TEXT,
  p_prompt_tokens INTEGER,
  p_completion_tokens INTEGER,
  p_cost_usd NUMERIC,
  p_latency_ms INTEGER,
  p_media_url TEXT DEFAULT NULL,
  p_media_type TEXT DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_msg text;
  v_payload jsonb;
  v_phone text;
BEGIN
  -- Salvar msg usuario
  v_payload := CASE WHEN p_media_url IS NOT NULL THEN jsonb_build_object('media_url', p_media_url, 'media_type', COALESCE(p_media_type, '')) ELSE NULL END;
  INSERT INTO public.messages (conversation_id, role, content, payload)
  VALUES (p_conversation_id, 'user', p_user_message, v_payload);

  -- Salvar msgs agente
  FOREACH v_msg IN ARRAY p_agent_messages LOOP
    INSERT INTO public.messages (conversation_id, role, content) VALUES (p_conversation_id, 'assistant', v_msg);
  END LOOP;

  -- Atualizar lead_card
  UPDATE public.lead_cards SET
    ciclo = p_ciclo,
    fase = p_fase,
    dados_capturados = p_dados_capturados,
    resumo = p_resumo,
    historico_fases = p_historico_fases,
    updated_at = now()
  WHERE id = p_lead_card_id;

  -- Incrementar conversas_usadas (apenas conversas reais no ciclo 1)
  IF p_tenant_id IS NOT NULL AND p_ciclo = 1 THEN
    SELECT phone INTO v_phone FROM public.conversations WHERE id = p_conversation_id;
    IF v_phone IS NULL OR v_phone NOT LIKE 'chat-test%' THEN
      UPDATE public.user_subscriptions
      SET conversas_usadas = COALESCE(conversas_usadas, 0) + 1, updated_at = now()
      WHERE user_id = p_tenant_id AND status = 'active';
    END IF;
  END IF;

  -- Usage tracking
  IF p_prompt_tokens > 0 THEN
    INSERT INTO public.api_usage_logs (tenant_id, model, prompt_tokens, completion_tokens, total_tokens, cost_usd, conversation_id)
    VALUES (p_tenant_id, p_model, p_prompt_tokens, p_completion_tokens, p_prompt_tokens + p_completion_tokens, p_cost_usd, p_conversation_id);

    INSERT INTO public.llm_request_logs (model_slug, provider_nome, tokens_input, tokens_output, custo_total, tipo, status, duracao_ms)
    VALUES (p_model, 'openrouter', p_prompt_tokens, p_completion_tokens, p_cost_usd, 'chat', 'success', p_latency_ms);
  END IF;
END;
$$;

;
