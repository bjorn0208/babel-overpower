-- 2026-05-08 17:09 BRT
-- Adiciona p_pular_insert_user a RPC salvar_resultados_turno.
-- DROP da assinatura antiga (20 args) + CREATE da nova (21 args) — nao da pra usar
-- CREATE OR REPLACE quando estamos adicionando argumento, vira overload conflitante.

DROP FUNCTION IF EXISTS public.salvar_resultados_turno(
  uuid, uuid, text, text[], integer, text, jsonb, text, text[],
  uuid, text, integer, integer, numeric, integer,
  text, text, jsonb, jsonb, uuid
);

CREATE FUNCTION public.salvar_resultados_turno(
  p_conversation_id uuid,
  p_lead_card_id uuid,
  p_user_message text,
  p_agent_messages text[],
  p_ciclo integer,
  p_fase text,
  p_dados_capturados jsonb,
  p_resumo text,
  p_historico_fases text[],
  p_tenant_id uuid DEFAULT NULL::uuid,
  p_model text DEFAULT ''::text,
  p_prompt_tokens integer DEFAULT 0,
  p_completion_tokens integer DEFAULT 0,
  p_cost_usd numeric DEFAULT 0,
  p_latency_ms integer DEFAULT 0,
  p_media_url text DEFAULT NULL::text,
  p_media_type text DEFAULT NULL::text,
  p_agent_payload jsonb DEFAULT NULL::jsonb,
  p_llm_metadata jsonb DEFAULT '{}'::jsonb,
  p_campaign_lead_id uuid DEFAULT NULL::uuid,
  p_pular_insert_user boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_msg text;
  v_payload jsonb;
BEGIN
  v_payload := CASE
    WHEN p_media_url IS NOT NULL THEN jsonb_build_object('media_url', p_media_url, 'media_type', p_media_type)
    ELSE NULL
  END;

  IF NOT p_pular_insert_user THEN
    INSERT INTO public.mensagens (conversation_id, role, content, carga, campaign_lead_id)
    VALUES (p_conversation_id, 'user', p_user_message, v_payload, p_campaign_lead_id);
  END IF;

  FOREACH v_msg IN ARRAY p_agent_messages LOOP
    INSERT INTO public.mensagens (conversation_id, role, content, carga, campaign_lead_id)
    VALUES (p_conversation_id, 'assistant', v_msg, p_agent_payload, p_campaign_lead_id);
  END LOOP;

  UPDATE public.fichas_lead
  SET ciclo = p_ciclo,
      fase = p_fase,
      dados_capturados = p_dados_capturados,
      resumo = p_resumo,
      historico_fases = p_historico_fases,
      updated_at = now()
  WHERE id = p_lead_card_id;

  IF p_prompt_tokens > 0 THEN
    INSERT INTO public.registro_uso_api (tenant_id, model, prompt_tokens, completion_tokens, total_tokens, cost_usd, conversation_id)
    VALUES (p_tenant_id, p_model, p_prompt_tokens, p_completion_tokens, p_prompt_tokens + p_completion_tokens, p_cost_usd, p_conversation_id);

    INSERT INTO public.logs_requisicao_llm (model_slug, provider_nome, tokens_input, tokens_output, custo_total, tipo, status, duracao_ms, metadata)
    VALUES (p_model, 'openrouter', p_prompt_tokens, p_completion_tokens, p_cost_usd, 'chat', 'sucesso', p_latency_ms, COALESCE(p_llm_metadata, '{}'::jsonb));
  END IF;
END;
$function$;

COMMENT ON FUNCTION public.salvar_resultados_turno IS
'Persiste turno (mensagens user+assistant, ficha, telemetria LLM). Quando p_pular_insert_user=true, pula o INSERT da user (webhook ja inseriu imediatamente ao receber). Default false mantem comportamento legado.';
;
