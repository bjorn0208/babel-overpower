-- FASE 0 · instrumentação belief pipeline.
-- Evolui save_turn_results pra aceitar p_llm_metadata (jsonb default {}) e propagar em llm_request_logs.metadata.
-- Cria view v_belief_taxa lendo belief_devolvido + motivo_falha dos últimos 7 dias de chat.

DROP FUNCTION IF EXISTS public.save_turn_results(uuid, uuid, text, text[], integer, text, jsonb, text, text[], uuid, text, integer, integer, numeric, integer, text);
DROP FUNCTION IF EXISTS public.save_turn_results(uuid, uuid, text, text[], integer, text, jsonb, text, text[], uuid, text, integer, integer, numeric, integer, text, text);
DROP FUNCTION IF EXISTS public.save_turn_results(uuid, uuid, text, text[], integer, text, jsonb, text, text[], uuid, text, integer, integer, numeric, integer, text, text, jsonb);

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
  p_media_url text DEFAULT NULL,
  p_media_type text DEFAULT NULL,
  p_agent_payload jsonb DEFAULT NULL,
  p_llm_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_msg text;
  v_payload jsonb;
  v_phone text;
BEGIN
  v_payload := CASE
    WHEN p_media_url IS NOT NULL THEN jsonb_build_object('media_url', p_media_url, 'media_type', p_media_type)
    ELSE NULL
  END;
  INSERT INTO public.messages (conversation_id, role, content, payload)
  VALUES (p_conversation_id, 'user', p_user_message, v_payload);

  FOREACH v_msg IN ARRAY p_agent_messages LOOP
    INSERT INTO public.messages (conversation_id, role, content, payload)
    VALUES (p_conversation_id, 'assistant', v_msg, p_agent_payload);
  END LOOP;

  UPDATE public.lead_cards SET
    ciclo = p_ciclo, fase = p_fase, dados_capturados = p_dados_capturados,
    resumo = p_resumo, historico_fases = p_historico_fases, updated_at = now()
  WHERE id = p_lead_card_id;

  IF p_tenant_id IS NOT NULL AND p_ciclo = 1 THEN
    SELECT phone INTO v_phone FROM public.conversations WHERE id = p_conversation_id;
    IF v_phone IS NULL OR v_phone NOT LIKE 'chat-test%' THEN
      UPDATE public.user_subscriptions
      SET conversas_usadas = COALESCE(conversas_usadas, 0) + 1, updated_at = now()
      WHERE user_id = p_tenant_id AND status = 'active';
    END IF;
  END IF;

  IF p_prompt_tokens > 0 THEN
    INSERT INTO public.api_usage_logs (tenant_id, model, prompt_tokens, completion_tokens, total_tokens, cost_usd, conversation_id)
    VALUES (p_tenant_id, p_model, p_prompt_tokens, p_completion_tokens, p_prompt_tokens + p_completion_tokens, p_cost_usd, p_conversation_id);

    -- FASE 0 · inclui metadata com belief_devolvido + motivo_falha (1 row por turno, não por bolha)
    INSERT INTO public.llm_request_logs (model_slug, provider_nome, tokens_input, tokens_output, custo_total, tipo, status, duracao_ms, metadata)
    VALUES (p_model, 'openrouter', p_prompt_tokens, p_completion_tokens, p_cost_usd, 'chat', 'success', p_latency_ms, COALESCE(p_llm_metadata, '{}'::jsonb));
  END IF;
END;
$$;

COMMENT ON FUNCTION public.save_turn_results(uuid, uuid, text, text[], integer, text, jsonb, text, text[], uuid, text, integer, integer, numeric, integer, text, text, jsonb, jsonb)
IS 'FASE 0 · persiste msgs + lead_card + usage. p_llm_metadata alimenta llm_request_logs.metadata com belief_devolvido + motivo_falha pra v_belief_taxa.';

-- View de diagnóstico da taxa de belief por turno (últimos 7 dias)
CREATE OR REPLACE VIEW public.v_belief_taxa AS
SELECT
  date_trunc('hour', created_at) AS hora,
  COUNT(*) AS total_turnos,
  COUNT(*) FILTER (WHERE (metadata->>'belief_devolvido')::boolean = true) AS belief_ok,
  COUNT(*) FILTER (WHERE metadata->>'motivo_falha' = 'parsed_ausente') AS falha_parsed_ausente,
  COUNT(*) FILTER (WHERE metadata->>'motivo_falha' = 'zod_falhou') AS falha_zod,
  COUNT(*) FILTER (WHERE metadata->>'motivo_falha' = 'sem_tenant') AS falha_sem_tenant,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE (metadata->>'belief_devolvido')::boolean = true)
    / NULLIF(COUNT(*), 0),
    2
  ) AS pct_ok
FROM public.llm_request_logs
WHERE tipo = 'chat'
  AND created_at > now() - interval '7 days'
  AND metadata ? 'belief_devolvido'
GROUP BY 1
ORDER BY 1 DESC;

COMMENT ON VIEW public.v_belief_taxa IS 'FASE 0 · taxa horária de belief_devolvido no pipeline do chat. Meta: pct_ok ≥ 80% em 24h.';
;
