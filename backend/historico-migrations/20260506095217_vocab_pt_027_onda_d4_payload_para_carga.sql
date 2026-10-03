
-- Onda D4: payload → carga em 6 tabelas
ALTER TABLE public.acoes_agendadas RENAME COLUMN payload TO carga;
ALTER TABLE public.acoes_agendadas ADD COLUMN payload jsonb GENERATED ALWAYS AS (carga) STORED;

ALTER TABLE public.admin_ia_propostas RENAME COLUMN payload TO carga;
ALTER TABLE public.admin_ia_propostas ADD COLUMN payload jsonb GENERATED ALWAYS AS (carga) STORED;

ALTER TABLE public.automacao_blocos RENAME COLUMN payload TO carga;
ALTER TABLE public.automacao_blocos ADD COLUMN payload jsonb GENERATED ALWAYS AS (carga) STORED;

ALTER TABLE public.caixa_saida_mensagens RENAME COLUMN payload TO carga;
ALTER TABLE public.caixa_saida_mensagens ADD COLUMN payload jsonb GENERATED ALWAYS AS (carga) STORED;

ALTER TABLE public.debug_webhook RENAME COLUMN payload TO carga;
ALTER TABLE public.debug_webhook ADD COLUMN payload jsonb GENERATED ALWAYS AS (carga) STORED;

ALTER TABLE public.mensagens RENAME COLUMN payload TO carga;
ALTER TABLE public.mensagens ADD COLUMN payload jsonb GENERATED ALWAYS AS (carga) STORED;

-- Corrige enviar_reproposta (INSERT em acoes_agendadas)
CREATE OR REPLACE FUNCTION public.enviar_reproposta(p_campaign_lead_ids uuid[], p_texto text DEFAULT NULL::text)
 RETURNS TABLE(campaign_lead_id uuid, reproposta_id uuid, scheduled_action_id uuid, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_caller uuid := auth.uid(); v_rec record; v_repid uuid; v_actid uuid; v_conv uuid; v_agent uuid; v_idx integer := 0;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  FOR v_rec IN
    SELECT cl.id AS cl_id, cl.lead_id AS lead_id, cl.campaign_id AS campaign_id, cl.reproposta_count AS rep_count,
           c.tenant_id AS tenant_id, c.status AS campaign_status, c.deleted_at AS campaign_deleted_at
    FROM public.leads_campanha cl JOIN public.campanhas c ON c.id = cl.campaign_id
    WHERE cl.id = ANY(p_campaign_lead_ids)
      AND (c.tenant_id = v_caller
           OR c.tenant_id IN (SELECT p.parent_user_id FROM public.profiles p WHERE p.id = v_caller AND p.parent_user_id IS NOT NULL)
           OR public.is_platform_admin())
  LOOP
    IF v_rec.campaign_deleted_at IS NOT NULL OR v_rec.campaign_status NOT IN ('active','paused','ativa','pausada') THEN
      campaign_lead_id := v_rec.cl_id; reproposta_id := NULL; scheduled_action_id := NULL; status := 'campanha_inativa';
      RETURN NEXT; CONTINUE;
    END IF;
    IF v_rec.rep_count >= 10 THEN
      campaign_lead_id := v_rec.cl_id; reproposta_id := NULL; scheduled_action_id := NULL; status := 'throttle_atingido';
      RETURN NEXT; CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM public.exclusoes_tenant toov WHERE toov.tenant_id = v_rec.tenant_id AND toov.lead_id = v_rec.lead_id) THEN
      campaign_lead_id := v_rec.cl_id; reproposta_id := NULL; scheduled_action_id := NULL; status := 'opt_out';
      RETURN NEXT; CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM public.leads l WHERE l.id = v_rec.lead_id AND l.opt_out_at IS NOT NULL) THEN
      campaign_lead_id := v_rec.cl_id; reproposta_id := NULL; scheduled_action_id := NULL; status := 'opt_out_lead';
      RETURN NEXT; CONTINUE;
    END IF;
    UPDATE public.acoes_agendadas SET status = 'cancelado'
    WHERE lead_id = v_rec.lead_id AND status IN ('pending','pendente')
      AND action_type IN ('campaign_trigger','campaign_reproposta','retomada_encerramento');
    v_idx := v_idx + 1;
    INSERT INTO public.repropostas_lead_campanha (campaign_lead_id, texto, created_by)
    VALUES (v_rec.cl_id, COALESCE(p_texto,''), v_caller) RETURNING id INTO v_repid;
    SELECT co.id, co.agente_id INTO v_conv, v_agent FROM public.conversas co
    WHERE co.lead_id = v_rec.lead_id AND co.tenant_id = v_rec.tenant_id ORDER BY co.updated_at DESC NULLS LAST LIMIT 1;
    INSERT INTO public.acoes_agendadas (lead_id, conversation_id, agente_id, action_type, scheduled_at, status, carga)
    VALUES (v_rec.lead_id, v_conv, v_agent, 'campaign_reproposta', now() + ((v_idx - 1) * interval '1 minute'), 'pendente',
            jsonb_build_object('campaign_id', v_rec.campaign_id, 'campaign_lead_id', v_rec.cl_id, 'reproposta_id', v_repid, 'texto_personalizado', COALESCE(p_texto,'')))
    RETURNING id INTO v_actid;
    UPDATE public.leads_campanha SET reproposta_count = reproposta_count + 1 WHERE id = v_rec.cl_id;
    campaign_lead_id := v_rec.cl_id; reproposta_id := v_repid; scheduled_action_id := v_actid; status := 'enfileirada';
    RETURN NEXT;
  END LOOP;
  RETURN;
END;
$function$;

-- Corrige salvar_resultados_turno (2 INSERTs em mensagens)
CREATE OR REPLACE FUNCTION public.salvar_resultados_turno(p_conversation_id uuid, p_lead_card_id uuid, p_user_message text, p_agent_messages text[], p_ciclo integer, p_fase text, p_dados_capturados jsonb, p_resumo text, p_historico_fases text[], p_tenant_id uuid DEFAULT NULL::uuid, p_model text DEFAULT ''::text, p_prompt_tokens integer DEFAULT 0, p_completion_tokens integer DEFAULT 0, p_cost_usd numeric DEFAULT 0, p_latency_ms integer DEFAULT 0, p_media_url text DEFAULT NULL::text, p_media_type text DEFAULT NULL::text, p_agent_payload jsonb DEFAULT NULL::jsonb, p_llm_metadata jsonb DEFAULT '{}'::jsonb, p_campaign_lead_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_msg text; v_payload jsonb;
BEGIN
  v_payload := CASE WHEN p_media_url IS NOT NULL THEN jsonb_build_object('media_url', p_media_url, 'media_type', p_media_type) ELSE NULL END;
  INSERT INTO public.mensagens (conversation_id, role, content, carga, campaign_lead_id)
  VALUES (p_conversation_id, 'user', p_user_message, v_payload, p_campaign_lead_id);
  FOREACH v_msg IN ARRAY p_agent_messages LOOP
    INSERT INTO public.mensagens (conversation_id, role, content, carga, campaign_lead_id)
    VALUES (p_conversation_id, 'assistant', v_msg, p_agent_payload, p_campaign_lead_id);
  END LOOP;
  UPDATE public.fichas_lead SET ciclo = p_ciclo, fase = p_fase, dados_capturados = p_dados_capturados,
    resumo = p_resumo, historico_fases = p_historico_fases, updated_at = now() WHERE id = p_lead_card_id;
  IF p_prompt_tokens > 0 THEN
    INSERT INTO public.registro_uso_api (tenant_id, model, prompt_tokens, completion_tokens, total_tokens, cost_usd, conversation_id)
    VALUES (p_tenant_id, p_model, p_prompt_tokens, p_completion_tokens, p_prompt_tokens + p_completion_tokens, p_cost_usd, p_conversation_id);
    INSERT INTO public.logs_requisicao_llm (model_slug, provider_nome, tokens_input, tokens_output, custo_total, tipo, status, duracao_ms, metadata)
    VALUES (p_model, 'openrouter', p_prompt_tokens, p_completion_tokens, p_cost_usd, 'chat', 'sucesso', p_latency_ms, COALESCE(p_llm_metadata, '{}'::jsonb));
  END IF;
END;
$function$;

;
