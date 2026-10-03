
-- 1. Adicionar coluna ciclos_por_conversa em platform_settings (config admin)
ALTER TABLE public.platform_settings 
  ADD COLUMN IF NOT EXISTS ciclos_por_conversa integer NOT NULL DEFAULT 30;

-- 2. Atualizar trigger para ler config dinamica e excluir chat-test
CREATE OR REPLACE FUNCTION public.update_conversas_on_agent_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant_id uuid;
  v_phone text;
  v_agent_count integer;
  v_ciclos integer;
BEGIN
  IF NEW.role != 'assistant' THEN RETURN NEW; END IF;

  SELECT c.tenant_id, c.phone INTO v_tenant_id, v_phone
  FROM public.conversations c WHERE c.id = NEW.conversation_id;

  IF v_tenant_id IS NULL THEN RETURN NEW; END IF;
  IF v_phone IS NOT NULL AND v_phone LIKE 'chat-test%' THEN RETURN NEW; END IF;

  -- Ler ciclos_por_conversa da config admin
  SELECT COALESCE(ps.ciclos_por_conversa, 30) INTO v_ciclos
  FROM public.platform_settings ps LIMIT 1;
  IF v_ciclos IS NULL OR v_ciclos < 1 THEN v_ciclos := 30; END IF;

  SELECT COUNT(*) INTO v_agent_count
  FROM public.messages
  WHERE conversation_id = NEW.conversation_id AND role = 'assistant';

  -- Incrementa na 1a msg e a cada N ciclos (boundary: count=1, 1+N, 1+2N...)
  IF v_agent_count = 1 OR (v_agent_count > 1 AND ((v_agent_count - 1) % v_ciclos) = 0) THEN
    UPDATE public.user_subscriptions
    SET conversas_usadas = COALESCE(conversas_usadas, 0) + 1, updated_at = now()
    WHERE user_id = v_tenant_id AND status = 'active';
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Remover incremento duplicado do save_turn_results (ambas overloads)
-- Recriar sem o bloco de incremento de conversas_usadas
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
  p_tenant_id uuid,
  p_model text,
  p_prompt_tokens integer,
  p_completion_tokens integer,
  p_cost_usd numeric,
  p_latency_ms integer,
  p_media_url text DEFAULT NULL,
  p_media_type text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_msg text;
  v_payload jsonb;
BEGIN
  -- Salvar msg usuario
  v_payload := CASE WHEN p_media_url IS NOT NULL THEN jsonb_build_object('media_url', p_media_url, 'media_type', COALESCE(p_media_type, '')) ELSE NULL END;
  INSERT INTO public.messages (conversation_id, role, content, payload)
  VALUES (p_conversation_id, 'user', p_user_message, v_payload);

  -- Salvar msgs agente (trigger cuida da contagem de conversas)
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
