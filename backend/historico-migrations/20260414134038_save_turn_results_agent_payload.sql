
CREATE OR REPLACE FUNCTION public.save_turn_results(
  p_conversation_id uuid, p_lead_card_id uuid, p_user_message text, p_agent_messages text[],
  p_ciclo integer, p_fase text, p_dados_capturados jsonb, p_resumo text, p_historico_fases text[],
  p_tenant_id uuid DEFAULT NULL::uuid, p_model text DEFAULT ''::text,
  p_prompt_tokens integer DEFAULT 0, p_completion_tokens integer DEFAULT 0,
  p_cost_usd numeric DEFAULT 0, p_latency_ms integer DEFAULT 0,
  p_media_url text DEFAULT NULL::text, p_media_type text DEFAULT NULL::text,
  p_agent_payload jsonb DEFAULT NULL::jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_msg text;
  v_payload jsonb;
  v_phone text;
BEGIN
  v_payload := CASE
    WHEN p_media_url IS NOT NULL THEN jsonb_build_object('media_url', p_media_url, 'media_type', p_media_type)
    ELSE NULL
  END;
  INSERT INTO messages (conversation_id, role, content, payload)
  VALUES (p_conversation_id, 'user', p_user_message, v_payload);

  FOREACH v_msg IN ARRAY p_agent_messages LOOP
    INSERT INTO messages (conversation_id, role, content, payload)
    VALUES (p_conversation_id, 'assistant', v_msg, p_agent_payload);
  END LOOP;

  UPDATE lead_cards SET
    ciclo = p_ciclo, fase = p_fase, dados_capturados = p_dados_capturados,
    resumo = p_resumo, historico_fases = p_historico_fases, updated_at = now()
  WHERE id = p_lead_card_id;

  IF p_tenant_id IS NOT NULL AND p_ciclo = 1 THEN
    SELECT phone INTO v_phone FROM conversations WHERE id = p_conversation_id;
    IF v_phone IS NULL OR v_phone NOT LIKE 'chat-test%' THEN
      UPDATE user_subscriptions SET conversas_usadas = COALESCE(conversas_usadas, 0) + 1, updated_at = now()
      WHERE user_id = p_tenant_id AND status = 'active';
    END IF;
  END IF;

  IF p_prompt_tokens > 0 THEN
    INSERT INTO api_usage_logs (tenant_id, model, prompt_tokens, completion_tokens, total_tokens, cost_usd, conversation_id)
    VALUES (p_tenant_id, p_model, p_prompt_tokens, p_completion_tokens, p_prompt_tokens + p_completion_tokens, p_cost_usd, p_conversation_id);
    INSERT INTO llm_request_logs (model_slug, provider_nome, tokens_input, tokens_output, custo_total, tipo, status, duracao_ms)
    VALUES (p_model, 'openrouter', p_prompt_tokens, p_completion_tokens, p_cost_usd, 'chat', 'success', p_latency_ms);
  END IF;
END;
$$;

;
