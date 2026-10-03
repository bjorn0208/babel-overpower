
CREATE OR REPLACE FUNCTION public.bufferar_mensagem_entrante(p_phone text, p_agent_id uuid, p_channel_id uuid, p_text text, p_media_url text DEFAULT NULL::text, p_media_type text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_existing record; v_msg jsonb;
BEGIN
  v_msg := jsonb_build_object(
    'text', COALESCE(p_text, ''), 'media_url', p_media_url,
    'media_type', p_media_type, 'received_at', now());
  SELECT * INTO v_existing FROM public.buffer_mensagens
  WHERE phone = p_phone AND agente_id = p_agent_id AND processed = false FOR UPDATE;
  IF v_existing IS NULL THEN
    INSERT INTO public.buffer_mensagens (phone, agente_id, channel_id, mensagens, is_composing, first_at, last_activity_at)
    VALUES (p_phone, p_agent_id, p_channel_id, jsonb_build_array(v_msg), false, now(), now());
    RETURN jsonb_build_object('is_first', true);
  ELSE
    UPDATE public.buffer_mensagens
    SET mensagens = mensagens || jsonb_build_array(v_msg), is_composing = false, last_activity_at = now()
    WHERE id = v_existing.id;
    RETURN jsonb_build_object('is_first', false);
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.buscar_ou_criar_conversa(p_phone text, p_tenant_id uuid, p_agent_id uuid, p_channel text DEFAULT 'chat'::text, p_first_fase text DEFAULT 'saudacao'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_conv record;
  v_lead_id uuid;
  v_ficha record;
  v_lead_converted boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_phone || COALESCE(p_tenant_id::text, '')));
  SELECT * INTO v_conv FROM public.conversas
  WHERE phone = p_phone AND tenant_id IS NOT DISTINCT FROM p_tenant_id AND status IN ('active', 'ativa')
  ORDER BY created_at DESC LIMIT 1;
  IF v_conv IS NULL THEN
    SELECT * INTO v_conv FROM public.conversas
    WHERE phone = p_phone AND tenant_id IS NOT DISTINCT FROM p_tenant_id
      AND status IN ('human', 'closed', 'humano', 'encerrada')
      AND created_at > now() - interval '30 days'
    ORDER BY created_at DESC LIMIT 1;
    IF v_conv IS NOT NULL THEN
      UPDATE public.conversas SET status = 'ativa' WHERE id = v_conv.id RETURNING * INTO v_conv;
    END IF;
  END IF;
  IF v_conv IS NOT NULL THEN
    SELECT (converted_at IS NOT NULL) INTO v_lead_converted FROM public.leads WHERE id = v_conv.lead_id;
    IF v_lead_converted AND v_conv.agent_enabled = true THEN
      UPDATE public.conversas SET agent_enabled = false WHERE id = v_conv.id;
      v_conv.agent_enabled := false;
    END IF;
  END IF;
  IF v_conv IS NULL THEN
    SELECT id INTO v_lead_id FROM public.leads
    WHERE phone = p_phone AND tenant_id IS NOT DISTINCT FROM p_tenant_id
    ORDER BY created_at DESC LIMIT 1;
    IF v_lead_id IS NULL THEN
      INSERT INTO public.leads (agente_id, phone, name, canal_externo, tenant_id)
      VALUES (p_agent_id, p_phone, p_phone, p_channel, p_tenant_id) RETURNING id INTO v_lead_id;
    END IF;
    SELECT (converted_at IS NOT NULL) INTO v_lead_converted FROM public.leads WHERE id = v_lead_id;
    INSERT INTO public.conversas (lead_id, phone, status, channel, tenant_id, agent_enabled)
    VALUES (v_lead_id, p_phone, 'ativa', p_channel, p_tenant_id, NOT COALESCE(v_lead_converted, false))
    RETURNING * INTO v_conv;
  END IF;
  SELECT * INTO v_ficha FROM public.fichas_lead WHERE conversation_id = v_conv.id LIMIT 1;
  IF v_ficha IS NULL THEN
    INSERT INTO public.fichas_lead (conversation_id, lead_id, agente_id, fase, ciclo, dados_capturados, resumo, historico_fases)
    VALUES (v_conv.id, v_conv.lead_id, p_agent_id, p_first_fase, 0, '{}'::jsonb, '', ARRAY[p_first_fase])
    RETURNING * INTO v_ficha;
  END IF;
  RETURN jsonb_build_object(
    'conversation', jsonb_build_object('id', v_conv.id, 'lead_id', v_conv.lead_id, 'phone', v_conv.phone, 'status', v_conv.status, 'agent_enabled', v_conv.agent_enabled, 'channel', v_conv.channel, 'tenant_id', v_conv.tenant_id),
    'lead_card', jsonb_build_object('id', v_ficha.id, 'fase', v_ficha.fase, 'ciclo', v_ficha.ciclo, 'dados_capturados', v_ficha.dados_capturados, 'resumo', v_ficha.resumo, 'historico_fases', to_jsonb(v_ficha.historico_fases), 'proximo_esperado', v_ficha.proximo_esperado)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.criar_cliente_manual(p_name text, p_phone text, p_product text DEFAULT NULL::text, p_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid; v_agent_id uuid; v_lead_id uuid; v_conv_id uuid; v_token text; v_existing_lead_id uuid;
BEGIN
  SELECT COALESCE(p.parent_user_id, p.id) INTO v_user_id FROM public.profiles p WHERE p.id = (SELECT auth.uid());
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Usuário não autenticado'; END IF;
  SELECT l.id INTO v_existing_lead_id FROM public.leads l WHERE l.tenant_id = v_user_id AND l.phone = p_phone LIMIT 1;
  IF v_existing_lead_id IS NOT NULL THEN RAISE EXCEPTION 'Já existe um lead com este telefone'; END IF;
  SELECT ua.id INTO v_agent_id FROM public.agentes_usuario ua WHERE ua.user_id = v_user_id LIMIT 1;
  v_token := encode(gen_random_bytes(16), 'hex');
  INSERT INTO public.leads (tenant_id, name, nome_exibicao, phone, email, produto, fase_pipeline, fase_cliente, converted_at, tracking_token, origem_lead, temperatura_lead)
  VALUES (v_user_id, p_name, p_name, p_phone, p_email, COALESCE(p_product, ''), 'fechado', 'documentacao', now(), v_token, 'manual', 'quente') RETURNING id INTO v_lead_id;
  INSERT INTO public.conversas (tenant_id, lead_id, phone, channel, status, agent_enabled)
  VALUES (v_user_id, v_lead_id, p_phone, 'whatsapp', 'ativa', true) RETURNING id INTO v_conv_id;
  IF v_agent_id IS NOT NULL THEN
    INSERT INTO public.fichas_lead (conversation_id, lead_id, agente_id, ciclo, fase) VALUES (v_conv_id, v_lead_id, v_agent_id, 1, 'fechado');
  END IF;
  RETURN jsonb_build_object('lead_id', v_lead_id, 'conversation_id', v_conv_id, 'tracking_token', v_token);
END;
$function$;

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
    INSERT INTO public.acoes_agendadas (lead_id, conversation_id, agente_id, action_type, scheduled_at, status, payload)
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

CREATE OR REPLACE FUNCTION public.publico_depoimento_para_rag()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_agent_id uuid;
  v_chunk_id uuid;
  v_content text;
BEGIN
  IF NEW.aprovado = true
     AND (TG_OP = 'INSERT' OR OLD.aprovado = false)
     AND NEW.rag_bloco_id IS NULL
  THEN
    SELECT id INTO v_agent_id
    FROM public.agentes_usuario
    WHERE user_id = NEW.user_id AND is_active = true
    ORDER BY created_at DESC LIMIT 1;

    IF v_agent_id IS NOT NULL THEN
      v_content := NEW.autor_nome
        || CASE WHEN NEW.nota IS NOT NULL THEN ' (' || NEW.nota || '★)' ELSE '' END
        || ': ' || NEW.texto;

      INSERT INTO public.blocos_conhecimento (agente_id, title, content, category, escopo, tipo, ativo)
      VALUES (
        v_agent_id,
        'Depoimento de ' || NEW.autor_nome,
        v_content,
        'prova_social',
        'tenant',
        'resposta',
        true
      ) RETURNING id INTO v_chunk_id;

      NEW.rag_bloco_id := v_chunk_id;
      NEW.aprovado_at := now();
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.aprovado = false
     AND OLD.aprovado = true
     AND OLD.rag_bloco_id IS NOT NULL
  THEN
    DELETE FROM public.blocos_conhecimento WHERE id = OLD.rag_bloco_id;
    NEW.rag_bloco_id := NULL;
    NEW.aprovado_at := NULL;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sincronizar_template_contrato_para_rag(p_contrato_id uuid)
 RETURNS TABLE(chunks_inseridos integer, chunks_atualizados integer, chunks_total integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_contrato record;
  v_agent_id uuid;
  v_conteudo text;
  v_partes text[];
  v_parte text;
  v_title text;
  v_inserted int := 0;
  v_updated int := 0;
  v_num int;
  v_prefix text;
BEGIN
  SELECT ct.id, ct.nome, ct.conteudo, ct.produto_id, ct.user_id, p.nome AS produto_nome
  INTO v_contrato
  FROM public.contratos_template ct
  LEFT JOIN public.produtos p ON p.id = ct.produto_id
  WHERE ct.id = p_contrato_id AND ct.ativo = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato nao encontrado ou inativo: %', p_contrato_id;
  END IF;

  SELECT ua.id INTO v_agent_id
  FROM public.agentes_usuario ua
  WHERE ua.user_id = v_contrato.user_id
  LIMIT 1;

  IF v_agent_id IS NULL THEN
    RAISE EXCEPTION 'Tenant sem agente: %', v_contrato.user_id;
  END IF;

  v_conteudo := COALESCE(v_contrato.conteudo, '');
  IF v_conteudo = '' THEN
    RAISE EXCEPTION 'Contrato sem conteudo: %', p_contrato_id;
  END IF;

  v_conteudo := regexp_replace(v_conteudo, '\[NOME_COMPLETO\]|\[NOME\]|\{NOME\}', '[NOME DO CLIENTE]', 'gi');
  v_conteudo := regexp_replace(v_conteudo, '\[CPF\]|\{CPF\}', '[CPF DO CLIENTE]', 'gi');
  v_conteudo := regexp_replace(v_conteudo, '\[EMAIL\]|\{EMAIL\}', '[EMAIL DO CLIENTE]', 'gi');
  v_conteudo := regexp_replace(v_conteudo, '\[TELEFONE\]|\{TELEFONE\}', '[TELEFONE DO CLIENTE]', 'gi');
  v_conteudo := regexp_replace(v_conteudo, '\[RG\]|\{RG\}', '[RG DO CLIENTE]', 'gi');
  v_conteudo := regexp_replace(v_conteudo, '\[CEP\]|\{CEP\}', '[CEP DO CLIENTE]', 'gi');
  v_conteudo := regexp_replace(v_conteudo, '\{NOME_EMPRESA\}|\[NOME_EMPRESA\]', '[EMPRESA]', 'gi');
  v_conteudo := regexp_replace(v_conteudo, '\{CNPJ\}|\[CNPJ\]', '[CNPJ DA EMPRESA]', 'gi');

  v_prefix := COALESCE(v_contrato.produto_nome, 'contrato') || ' — ';

  v_partes := regexp_split_to_array(
    v_conteudo,
    '(?=CLÁUSULA\s+\d+|CLAUSULA\s+\d+|Cláusula\s+\d+|Clausula\s+\d+)'
  );

  IF array_length(v_partes, 1) < 2 THEN
    v_partes := regexp_split_to_array(v_conteudo, '\n\s*\n');
  END IF;

  v_num := 0;
  FOREACH v_parte IN ARRAY v_partes LOOP
    v_parte := btrim(v_parte);
    IF length(v_parte) < 40 OR length(v_parte) > 2000 THEN
      CONTINUE;
    END IF;

    v_num := v_num + 1;

    v_title := v_prefix || substring(split_part(v_parte, E'\n', 1) FROM 1 FOR 100);

    INSERT INTO public.blocos_conhecimento
      (agente_id, title, content, category, tags, tipo, escopo, ativo)
    VALUES (
      v_agent_id,
      v_title,
      v_parte,
      'contrato',
      ARRAY['contrato', 'clausula', COALESCE(v_contrato.produto_nome, 'geral')],
      'clausula_contrato',
      'tenant',
      true
    )
    ON CONFLICT DO NOTHING;

    IF FOUND THEN
      v_inserted := v_inserted + 1;
    ELSE
      UPDATE public.blocos_conhecimento
      SET content = v_parte,
          tags = ARRAY['contrato', 'clausula', COALESCE(v_contrato.produto_nome, 'geral')]
      WHERE agente_id = v_agent_id AND title = v_title;
      IF FOUND THEN v_updated := v_updated + 1; END IF;
    END IF;
  END LOOP;

  chunks_inseridos := v_inserted;
  chunks_atualizados := v_updated;
  chunks_total := v_num;
  RETURN NEXT;
END;
$function$;

;
