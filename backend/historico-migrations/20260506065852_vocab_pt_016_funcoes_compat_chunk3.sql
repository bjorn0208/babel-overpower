-- Migration 16 chunk 3: 14 funções

CREATE OR REPLACE FUNCTION public.preencher_candidatos_tag(p_nicho_id uuid)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_inseridos integer := 0;
BEGIN
  IF p_nicho_id IS NULL THEN RAISE EXCEPTION 'nicho_id obrigatorio'; END IF;
  WITH agg AS (
    SELECT unnest(l.tags) AS tag_text, count(DISTINCT l.id) AS num_leads, count(*) AS num_obs,
      array_agg(DISTINCT l.id) FILTER (WHERE l.id IS NOT NULL) AS evidence
    FROM public.leads l JOIN public.profiles p ON p.id = l.tenant_id
    WHERE p.nicho_id = p_nicho_id AND l.tags IS NOT NULL AND array_length(l.tags, 1) > 0
    GROUP BY 1
  ),
  ins AS (
    INSERT INTO public.candidatos_tag (nicho_id, tag_text, num_observacoes, num_leads_independentes, evidencia_lead_ids, status, criado_em, atualizado_em)
    SELECT p_nicho_id, a.tag_text, a.num_obs, a.num_leads, (a.evidence)[1:5], 'pendente', now(), now() FROM agg a
    ON CONFLICT (nicho_id, tag_text) DO UPDATE
    SET num_observacoes = EXCLUDED.num_observacoes, num_leads_independentes = EXCLUDED.num_leads_independentes,
        evidencia_lead_ids = EXCLUDED.evidencia_lead_ids, atualizado_em = now()
    RETURNING 1
  )
  SELECT count(*) INTO v_inseridos FROM ins;
  RETURN v_inseridos;
END;
$function$;

CREATE OR REPLACE FUNCTION public.processar_aprovacao_pedido()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_plano public.loja_planos%ROWTYPE; v_sub_id uuid;
BEGIN
  IF NEW.status != 'aprovado' THEN RETURN NEW; END IF;
  IF OLD.status = 'aprovado' THEN RETURN NEW; END IF;
  IF NEW.tipo = 'plano' THEN
    SELECT * INTO v_plano FROM public.loja_planos WHERE id = NEW.item_id;
    IF v_plano.id IS NOT NULL THEN
      SELECT id INTO v_sub_id FROM public.assinaturas_usuario WHERE user_id = NEW.user_id AND status IN ('active','ativa') LIMIT 1;
      IF v_sub_id IS NOT NULL THEN
        UPDATE public.assinaturas_usuario SET
          plano_id = NEW.item_id, plano_nome = NEW.item_nome, preco = NEW.item_preco,
          max_conversas = COALESCE(v_plano.max_conversas, 1000),
          max_ciclos_por_conversa = COALESCE(v_plano.max_ciclos_por_conversa, 50),
          max_storage_bytes = 209715200,
          data_inicio = now(), data_expiracao = now() + (COALESCE(v_plano.dias_expiracao, 30) || ' days')::interval,
          conversas_usadas = 0, updated_at = now()
        WHERE id = v_sub_id;
      ELSE
        INSERT INTO public.assinaturas_usuario (user_id, plano_id, plano_nome, preco, max_conversas, max_ciclos_por_conversa, max_storage_bytes, data_inicio, data_expiracao, status)
        VALUES (NEW.user_id, NEW.item_id, NEW.item_nome, NEW.item_preco, COALESCE(v_plano.max_conversas, 1000), COALESCE(v_plano.max_ciclos_por_conversa, 50), 209715200,
          now(), now() + (COALESCE(v_plano.dias_expiracao, 30) || ' days')::interval, 'ativa');
      END IF;
    END IF;
  END IF;
  IF NEW.tipo = 'plus' THEN UPDATE public.profiles SET multinivel_ativo = true WHERE id = NEW.user_id; END IF;
  IF NEW.tipo = 'pacote_extra' THEN
    UPDATE public.assinaturas_usuario
    SET max_conversas = max_conversas + COALESCE((SELECT conversas FROM public.loja_pacotes_extra WHERE id = NEW.item_id), 500), updated_at = now()
    WHERE user_id = NEW.user_id AND status IN ('active','ativa');
  END IF;
  IF NEW.tipo = 'implantacao' THEN UPDATE public.profiles SET is_active = true, account_status = 'ativo' WHERE id = NEW.user_id; END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.registrar_ticket_conversa()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_tenant_id uuid; v_phone text; v_agent_count integer; v_ciclos integer; v_origem text; v_campaign_lead_id uuid; v_ciclo_bucket integer; v_inserted integer;
BEGIN
  IF NEW.role != 'assistant' THEN RETURN NEW; END IF;
  SELECT c.tenant_id, c.phone INTO v_tenant_id, v_phone FROM public.conversas c WHERE c.id = NEW.conversation_id;
  IF v_tenant_id IS NULL THEN RETURN NEW; END IF;
  IF v_phone IS NOT NULL AND v_phone LIKE 'chat-test%' THEN RETURN NEW; END IF;
  SELECT COALESCE(us.max_ciclos_por_conversa, 30) INTO v_ciclos FROM public.assinaturas_usuario us
  WHERE us.user_id = v_tenant_id AND us.status IN ('active','ativa') AND us.data_expiracao >= now() LIMIT 1;
  IF v_ciclos IS NULL THEN RETURN NEW; END IF;
  IF NEW.campaign_lead_id IS NOT NULL THEN
    v_origem := 'campanha'; v_campaign_lead_id := NEW.campaign_lead_id;
    SELECT COUNT(*) INTO v_agent_count FROM public.mensagens m
    WHERE m.conversation_id = NEW.conversation_id AND m.role='assistant' AND m.campaign_lead_id = v_campaign_lead_id AND m.created_at <= NEW.created_at;
  ELSE
    v_origem := 'espontaneo'; v_campaign_lead_id := NULL;
    SELECT COUNT(*) INTO v_agent_count FROM public.mensagens m
    WHERE m.conversation_id = NEW.conversation_id AND m.role='assistant' AND m.campaign_lead_id IS NULL AND m.created_at <= NEW.created_at;
  END IF;
  IF (v_agent_count - 1) % v_ciclos = 0 THEN
    v_ciclo_bucket := floor((v_agent_count - 1)::numeric / v_ciclos::numeric)::int;
    INSERT INTO public.tickets_conversa (tenant_id, conversation_id, origem, campaign_lead_id, ciclo_bucket, created_at)
    VALUES (v_tenant_id, NEW.conversation_id, v_origem, v_campaign_lead_id, v_ciclo_bucket, NEW.created_at) ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    IF v_inserted > 0 THEN
      UPDATE public.assinaturas_usuario SET conversas_usadas = COALESCE(conversas_usadas, 0) + 1, updated_at = now()
      WHERE user_id = v_tenant_id AND status IN ('active','ativa');
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.resetar_ciclo_assinatura(p_user_id uuid, p_dias integer DEFAULT 30)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  UPDATE public.assinaturas_usuario SET conversas_usadas = 0, data_inicio = now(),
    data_expiracao = now() + (p_dias || ' days')::interval, updated_at = now()
  WHERE user_id = p_user_id AND status IN ('active','ativa');
END;
$function$;

CREATE OR REPLACE FUNCTION public.resolver_cupom_ativo(p_tenant_id uuid, p_codigo text)
 RETURNS TABLE(campaign_id uuid, comissao_tipo text, comissao_valor numeric)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth'
AS $function$
BEGIN
  RETURN QUERY SELECT m.campaign_id, m.comissao_tipo, m.comissao_valor FROM public.meta_indicacao_campanha m
  JOIN public.campanhas c ON c.id = m.campaign_id
  WHERE m.tenant_id = p_tenant_id AND lower(m.cupom) = lower(p_codigo)
    AND c.status IN ('active','ativa') AND c.deleted_at IS NULL
    AND (c.ends_at IS NULL OR c.ends_at > now()) AND (c.starts_at <= now()) LIMIT 1;
END;
$function$;

CREATE OR REPLACE FUNCTION public.retentar_acoes_agendadas_falhas()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  IF NEW.status IN ('failed','falhou') AND COALESCE(NEW.tentativas, 0) < 3 THEN
    NEW.scheduled_at := now() + interval '5 minutes';
    NEW.status := 'pendente';
    NEW.tentativas := COALESCE(OLD.tentativas, 0) + 1;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.revert_tag_merge(p_log_id uuid)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_log public.registro_fusao_tag%ROWTYPE; v_revert integer := 0;
BEGIN
  SELECT * INTO v_log FROM public.registro_fusao_tag WHERE id = p_log_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'log nao encontrado'; END IF;
  IF v_log.applied_at < now() - interval '90 days' THEN RAISE EXCEPTION 'janela de 90 dias expirou'; END IF;
  WITH afetados AS (
    UPDATE public.leads SET tags = (SELECT array_agg(DISTINCT t) FROM (SELECT unnest(tags) AS t UNION SELECT v_log.tag_origem) z)
    FROM public.profiles p
    WHERE p.id = public.leads.tenant_id AND p.nicho_id = v_log.nicho_id AND public.leads.tags @> ARRAY[v_log.tag_destino]
    RETURNING public.leads.id
  )
  SELECT count(*) INTO v_revert FROM afetados;
  INSERT INTO public.candidatos_tag (nicho_id, tag_text, num_observacoes, num_leads_independentes, evidencia_lead_ids, status, criado_em, atualizado_em)
  VALUES (v_log.nicho_id, v_log.tag_origem, v_log.num_observacoes_movidas, v_log.num_observacoes_movidas, ARRAY[]::uuid[], 'pendente', now(), now())
  ON CONFLICT (nicho_id, tag_text) DO UPDATE
  SET num_leads_independentes = EXCLUDED.num_leads_independentes, atualizado_em = now();
  UPDATE public.sugestoes_fusao_tag SET status = 'rejeitado', decided_at = now() WHERE id = v_log.origem_suggestion_id;
  DELETE FROM public.registro_fusao_tag WHERE id = p_log_id;
  RETURN v_revert;
END;
$function$;

CREATE OR REPLACE FUNCTION public.salvar_resultados_turno(p_conversation_id uuid, p_lead_card_id uuid, p_user_message text, p_agent_messages text[], p_ciclo integer, p_fase text, p_dados_capturados jsonb, p_resumo text, p_historico_fases text[], p_tenant_id uuid DEFAULT NULL::uuid, p_model text DEFAULT ''::text, p_prompt_tokens integer DEFAULT 0, p_completion_tokens integer DEFAULT 0, p_cost_usd numeric DEFAULT 0, p_latency_ms integer DEFAULT 0, p_media_url text DEFAULT NULL::text, p_media_type text DEFAULT NULL::text, p_agent_payload jsonb DEFAULT NULL::jsonb, p_llm_metadata jsonb DEFAULT '{}'::jsonb, p_campaign_lead_id uuid DEFAULT NULL::uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_msg text; v_payload jsonb;
BEGIN
  v_payload := CASE WHEN p_media_url IS NOT NULL THEN jsonb_build_object('media_url', p_media_url, 'media_type', p_media_type) ELSE NULL END;
  INSERT INTO public.mensagens (conversation_id, role, content, payload, campaign_lead_id)
  VALUES (p_conversation_id, 'user', p_user_message, v_payload, p_campaign_lead_id);
  FOREACH v_msg IN ARRAY p_agent_messages LOOP
    INSERT INTO public.mensagens (conversation_id, role, content, payload, campaign_lead_id)
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

CREATE OR REPLACE FUNCTION public.sincronizar_status_conversa_de_lead_campanha()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_lead_id uuid; v_has_ativo boolean;
BEGIN
  v_lead_id := COALESCE(NEW.lead_id, OLD.lead_id);
  IF v_lead_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT EXISTS (SELECT 1 FROM public.leads_campanha WHERE lead_id = v_lead_id AND state = 'ativo') INTO v_has_ativo;
  IF v_has_ativo THEN
    UPDATE public.conversas SET status = 'campaign', agent_enabled = false
    WHERE lead_id = v_lead_id AND status NOT IN ('campaign','closed','encerrada');
  ELSE
    UPDATE public.conversas SET status = 'ativa', agent_enabled = true
    WHERE lead_id = v_lead_id AND status = 'campaign';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE OR REPLACE FUNCTION public.substituir_caixa_saida_pendentes(p_conversation_id uuid, p_since timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_count integer;
BEGIN
  UPDATE public.caixa_saida_mensagens SET status = 'substituida', updated_at = now()
  WHERE conversation_id = p_conversation_id AND status IN ('pending','pendente') AND (p_since IS NULL OR created_at < p_since);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tg_admin_ia_blocos_enqueue_embedding()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  IF NEW.embedding_status IN ('pending','pendente') AND NEW.embedding IS NULL THEN
    PERFORM pgmq.send('embedding_jobs', jsonb_build_object('table', 'admin_ia_blocos', 'row_id', NEW.id::text, 'text', coalesce(NEW.titulo,'') || E'\n\n' || NEW.conteudo));
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_anti_n1_candidatos_bloco()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  IF NEW.status IN ('approved','promoted','aprovado') AND OLD.status NOT IN ('approved','promoted','aprovado') THEN
    IF NEW.num_leads_independentes < 5 THEN
      RAISE EXCEPTION 'chunk_candidate %: anti-N=1 bloqueia promoção — num_leads_independentes=% (mínimo: 5).',
        NEW.id, NEW.num_leads_independentes USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_anti_n1_tag_candidates()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  IF NEW.status IN ('approved','promoted','aprovado') AND OLD.status NOT IN ('approved','promoted','aprovado') THEN
    IF NEW.num_leads_independentes < 5 THEN
      RAISE EXCEPTION 'tag_candidate %: anti-N=1 bloqueia promoção — num_leads_independentes=% (mínimo: 5).',
        NEW.id, NEW.num_leads_independentes USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.verificar_incrementar_armazenamento(p_user_id uuid, p_bytes bigint)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_used bigint; v_max bigint;
BEGIN
  SELECT storage_used_bytes, max_storage_bytes INTO v_used, v_max FROM public.assinaturas_usuario
  WHERE user_id = p_user_id AND status IN ('active','ativa') LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF (v_used + p_bytes) > v_max THEN RETURN false; END IF;
  UPDATE public.assinaturas_usuario SET storage_used_bytes = storage_used_bytes + p_bytes, updated_at = now()
  WHERE user_id = p_user_id AND status IN ('active','ativa');
  RETURN true;
END;
$function$;
;
