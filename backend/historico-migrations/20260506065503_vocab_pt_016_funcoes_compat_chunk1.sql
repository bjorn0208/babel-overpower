-- Migration 16 chunk 1: 14 funções com bodies compat EN+PT
-- Filtros: IN ('EN','PT') · Escritas: 'PT'

CREATE OR REPLACE FUNCTION public.admin_ia_levantar_tenant_360(p_tenant_id uuid, p_periodo_dias integer DEFAULT 7)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_perfil jsonb; v_produtos jsonb; v_agentes jsonb; v_campanhas jsonb;
  v_metricas jsonb; v_chunks jsonb;
BEGIN
  SELECT to_jsonb(p) - 'avatar_url' INTO v_perfil FROM public.profiles p WHERE p.id = p_tenant_id;
  IF v_perfil IS NULL THEN RETURN jsonb_build_object('erro', 'tenant_nao_encontrado', 'tenant_id', p_tenant_id); END IF;

  SELECT jsonb_agg(to_jsonb(pr) ORDER BY pr.created_at DESC) INTO v_produtos
  FROM (SELECT * FROM public.produtos WHERE user_id = p_tenant_id ORDER BY created_at DESC LIMIT 30) pr;

  SELECT jsonb_agg(to_jsonb(ua)) INTO v_agentes
  FROM (SELECT * FROM public.agentes_usuario WHERE user_id = p_tenant_id LIMIT 10) ua;

  SELECT jsonb_agg(to_jsonb(c) ORDER BY c.created_at DESC) INTO v_campanhas
  FROM (SELECT * FROM public.campanhas WHERE tenant_id = p_tenant_id AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 30) c;

  v_metricas := jsonb_build_object(
    'leads_total', (SELECT count(*) FROM public.leads WHERE tenant_id = p_tenant_id AND deleted_at IS NULL),
    'leads_ult_periodo', (SELECT count(*) FROM public.leads WHERE tenant_id = p_tenant_id AND deleted_at IS NULL AND created_at >= now() - (p_periodo_dias || ' days')::interval),
    'conversas_total', (SELECT count(*) FROM public.conversas WHERE tenant_id = p_tenant_id),
    'conversas_active', (SELECT count(*) FROM public.conversas WHERE tenant_id = p_tenant_id AND status IN ('active', 'ativa')),
    'leads_dados_ficha_preenchida', (SELECT count(*) FROM public.leads WHERE tenant_id = p_tenant_id AND deleted_at IS NULL AND dados_ficha IS NOT NULL AND dados_ficha::text != '{}'),
    'tag_observations_ult_periodo', (SELECT count(*) FROM public.observacoes_tag WHERE tenant_id = p_tenant_id AND criado_em >= now() - (p_periodo_dias || ' days')::interval)
  );

  SELECT jsonb_agg(jsonb_build_object('tabela', kc.tabela, 'count', kc.n))
  INTO v_chunks FROM (
    SELECT 'behavior' AS tabela, count(*) AS n FROM public.blocos_comportamento WHERE tenant_id = p_tenant_id AND ativo = true
    UNION ALL SELECT 'trigger', count(*) FROM public.blocos_gatilho WHERE tenant_id = p_tenant_id AND ativo = true
    UNION ALL SELECT 'humano', count(*) FROM public.blocos_humanizacao WHERE tenant_id = p_tenant_id AND ativo = true
  ) kc;

  RETURN jsonb_build_object(
    'tenant', v_perfil,
    'produtos', COALESCE(v_produtos, '[]'::jsonb),
    'agentes', COALESCE(v_agentes, '[]'::jsonb),
    'campanhas', COALESCE(v_campanhas, '[]'::jsonb),
    'metricas', v_metricas,
    'chunks_curadoria', COALESCE(v_chunks, '[]'::jsonb)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.aplicar_fusao_tag(p_suggestion_id uuid, p_canonical text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_sug      public.sugestoes_fusao_tag%ROWTYPE;
  v_destino  text;
  v_origens  text[];
  v_origem   text;
  v_leads_atualizados integer := 0;
  v_total integer := 0;
  v_user     uuid;
BEGIN
  v_user := auth.uid();
  SELECT * INTO v_sug FROM public.sugestoes_fusao_tag WHERE id = p_suggestion_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'sugestao nao encontrada'; END IF;
  IF v_sug.status NOT IN ('pending', 'pendente') THEN RAISE EXCEPTION 'sugestao ja decidida (status=%)', v_sug.status; END IF;
  v_destino := COALESCE(p_canonical, v_sug.suggested_canonical);
  IF v_sug.tags IS NOT NULL AND array_length(v_sug.tags, 1) > 0 THEN
    v_origens := array(SELECT t FROM unnest(v_sug.tags) t WHERE t <> v_destino);
  ELSE
    v_origens := array(SELECT t FROM unnest(ARRAY[v_sug.tag_a, v_sug.tag_b]) t WHERE t <> v_destino AND t IS NOT NULL);
  END IF;
  IF array_length(v_origens, 1) IS NULL OR array_length(v_origens, 1) = 0 THEN
    RAISE EXCEPTION 'nenhuma tag origem (canonical %s sozinha?)', v_destino;
  END IF;
  FOREACH v_origem IN ARRAY v_origens LOOP
    WITH afetados AS (
      UPDATE public.leads
      SET tags = (SELECT array_agg(DISTINCT t) FROM (SELECT CASE WHEN x = v_origem THEN v_destino ELSE x END AS t FROM unnest(tags) x) z)
      FROM public.profiles p
      WHERE p.id = public.leads.tenant_id AND p.nicho_id = v_sug.nicho_id AND public.leads.tags @> ARRAY[v_origem]
      RETURNING public.leads.id
    )
    SELECT count(*) INTO v_leads_atualizados FROM afetados;
    UPDATE public.candidatos_tag
    SET num_leads_independentes = num_leads_independentes + COALESCE((SELECT num_leads_independentes FROM public.candidatos_tag WHERE nicho_id = v_sug.nicho_id AND tag_text = v_origem), 0), atualizado_em = now()
    WHERE nicho_id = v_sug.nicho_id AND tag_text = v_destino;
    DELETE FROM public.candidatos_tag WHERE nicho_id = v_sug.nicho_id AND tag_text = v_origem;
    UPDATE public.observacoes_tag o SET tag_text = v_destino FROM public.profiles p WHERE p.id = o.tenant_id AND p.nicho_id = v_sug.nicho_id AND o.tag_text = v_origem;
    INSERT INTO public.registro_fusao_tag (nicho_id, tag_origem, tag_destino, num_observacoes_movidas, applied_at, applied_by, origem_suggestion_id)
    VALUES (v_sug.nicho_id, v_origem, v_destino, v_leads_atualizados, now(), v_user, p_suggestion_id);
    v_total := v_total + v_leads_atualizados;
  END LOOP;
  UPDATE public.sugestoes_fusao_tag SET status = 'aprovado', decided_at = now(), decided_by = v_user WHERE id = p_suggestion_id;
  RETURN v_total;
END;
$function$;

CREATE OR REPLACE FUNCTION public.aprovar_depoimento_para_rag(p_testimonial_id uuid, p_admin_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_testimonial public.depoimentos_publicos%ROWTYPE;
  v_chunk_id uuid;
  v_conteudo text;
BEGIN
  SELECT * INTO v_testimonial FROM public.depoimentos_publicos WHERE id = p_testimonial_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'testimonial % não encontrado', p_testimonial_id USING ERRCODE = 'no_data_found'; END IF;
  IF v_testimonial.user_id IS NULL THEN RAISE EXCEPTION 'testimonial sem user_id (tenant)' USING ERRCODE = 'invalid_parameter_value'; END IF;
  v_conteudo := format('Depoimento de %s (nota %s/5): %s', coalesce(v_testimonial.autor_nome, 'cliente anônimo'), coalesce(v_testimonial.nota::text, '-'), v_testimonial.texto);
  INSERT INTO public.blocos_conhecimento (tenant_id, escopo, tipo, categoria, conteudo, embedding_status, ativa, created_by, criado_em, atualizado_em)
  VALUES (v_testimonial.user_id, 'tenant', 'depoimento', 'social_proof', v_conteudo, 'pendente', true, p_admin_id, now(), now())
  RETURNING id INTO v_chunk_id;
  UPDATE public.depoimentos_publicos SET aprovado = true, aprovado_at = now(), rag_bloco_id = v_chunk_id WHERE id = p_testimonial_id;
  RETURN v_chunk_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.aprovar_trecho_conversa_para_rag(p_tenant_id uuid, p_conversation_id uuid, p_message_ids uuid[], p_tipo text, p_categoria text, p_admin_id uuid, p_chunk_candidate_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_conteudo text;
  v_chunk_id uuid;
  v_count int;
BEGIN
  PERFORM 1 FROM public.conversas WHERE id = p_conversation_id AND tenant_id = p_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'conversation % não pertence ao tenant %', p_conversation_id, p_tenant_id USING ERRCODE = 'insufficient_privilege'; END IF;
  SELECT string_agg(m.role || ': ' || m.content, E'\n' ORDER BY m.created_at ASC), count(*)
  INTO v_conteudo, v_count FROM public.mensagens m
  WHERE m.id = ANY(p_message_ids) AND m.conversation_id = p_conversation_id;
  IF v_count = 0 OR v_conteudo IS NULL THEN RAISE EXCEPTION 'nenhuma mensagem encontrada pra excerto' USING ERRCODE = 'no_data_found'; END IF;
  INSERT INTO public.blocos_conhecimento (tenant_id, escopo, tipo, categoria, conteudo, embedding_status, ativa, created_by, criado_em, atualizado_em)
  VALUES (p_tenant_id, 'tenant', p_tipo, p_categoria, v_conteudo, 'pendente', true, p_admin_id, now(), now())
  RETURNING id INTO v_chunk_id;
  IF p_chunk_candidate_id IS NOT NULL THEN
    UPDATE public.candidatos_bloco SET status = 'promoted', promoted_bloco_id = v_chunk_id, promoted_bloco_table = 'blocos_conhecimento', decided_at = now(), decided_by = p_admin_id
    WHERE id = p_chunk_candidate_id AND tenant_id = p_tenant_id;
  END IF;
  RETURN v_chunk_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assinar_contrato_publico(p_token uuid, p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_contract_id uuid;
  v_status text;
  v_now timestamptz := now();
BEGIN
  IF p_token IS NULL OR p_payload IS NULL THEN RAISE EXCEPTION 'token e payload obrigatorios' USING ERRCODE = '22023'; END IF;
  SELECT id, status INTO v_contract_id, v_status FROM public.contratos WHERE token = p_token LIMIT 1;
  IF v_contract_id IS NULL THEN RAISE EXCEPTION 'contrato nao encontrado' USING ERRCODE = 'P0002'; END IF;
  IF v_status NOT IN ('pending', 'pendente') THEN RAISE EXCEPTION 'contrato ja processado' USING ERRCODE = '42501'; END IF;
  PERFORM public.check_public_rate_limit(p_token::text, 'sign_contract_public', 5);
  UPDATE public.contratos
  SET status = 'aguardando_validacao', signed_at = v_now,
      signature_ip = COALESCE(p_payload->>'signature_ip', 'unknown'),
      contract_hash = p_payload->>'contract_hash',
      client_data = COALESCE(p_payload->'client_data', client_data),
      payment_method = COALESCE(p_payload->>'payment_method', payment_method),
      contract_text = COALESCE(p_payload->>'contract_text', contract_text),
      signer_data = COALESCE(p_payload->'signer_data', signer_data),
      selfie_url = p_payload->>'selfie_url',
      document_url = p_payload->>'document_url',
      signature_url = p_payload->>'signature_url',
      witness_data = COALESCE(p_payload->'witness_data', witness_data),
      witness_selfie_url = p_payload->>'witness_selfie_url',
      witness_document_url = p_payload->>'witness_document_url',
      witness_signature_url = p_payload->>'witness_signature_url',
      witness_signed_at = CASE WHEN p_payload ? 'witness_signed_at' THEN v_now ELSE witness_signed_at END,
      witness_ip = p_payload->>'witness_ip'
  WHERE id = v_contract_id;
  RETURN v_contract_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.atualizar_cache_conversas_usadas(p_tenant_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_count int;
BEGIN
  v_count := public.get_conversas_usadas(p_tenant_id);
  UPDATE public.assinaturas_usuario SET conversas_usadas = v_count, updated_at = now()
  WHERE user_id = p_tenant_id AND status IN ('active', 'ativa');
  RETURN v_count;
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
      INSERT INTO public.leads (agent_id, phone, name, external_channel, tenant_id)
      VALUES (p_agent_id, p_phone, p_phone, p_channel, p_tenant_id) RETURNING id INTO v_lead_id;
    END IF;
    SELECT (converted_at IS NOT NULL) INTO v_lead_converted FROM public.leads WHERE id = v_lead_id;
    INSERT INTO public.conversas (lead_id, phone, status, channel, tenant_id, agent_enabled)
    VALUES (v_lead_id, p_phone, 'ativa', p_channel, p_tenant_id, NOT COALESCE(v_lead_converted, false))
    RETURNING * INTO v_conv;
  END IF;
  SELECT * INTO v_ficha FROM public.fichas_lead WHERE conversation_id = v_conv.id LIMIT 1;
  IF v_ficha IS NULL THEN
    INSERT INTO public.fichas_lead (conversation_id, lead_id, agent_id, fase, ciclo, dados_capturados, resumo, historico_fases)
    VALUES (v_conv.id, v_conv.lead_id, p_agent_id, p_first_fase, 0, '{}'::jsonb, '', ARRAY[p_first_fase])
    RETURNING * INTO v_ficha;
  END IF;
  RETURN jsonb_build_object(
    'conversation', jsonb_build_object('id', v_conv.id, 'lead_id', v_conv.lead_id, 'phone', v_conv.phone, 'status', v_conv.status, 'agent_enabled', v_conv.agent_enabled, 'channel', v_conv.channel, 'tenant_id', v_conv.tenant_id),
    'lead_card', jsonb_build_object('id', v_ficha.id, 'fase', v_ficha.fase, 'ciclo', v_ficha.ciclo, 'dados_capturados', v_ficha.dados_capturados, 'resumo', v_ficha.resumo, 'historico_fases', to_jsonb(v_ficha.historico_fases), 'proximo_esperado', v_ficha.proximo_esperado)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.carregar_contexto_agente(p_agent_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'agent', jsonb_build_object('id', ua.id, 'identidade', ua.identidade, 'fluxo', ua.fluxo, 'configuracao', ua.configuracao, 'modelo_principal', ua.modelo_principal, 'temperatura', ua.temperatura, 'max_tokens', ua.max_tokens, 'is_active', ua.is_active),
    'tenant_id', ua.user_id, 'nicho_id', p.nicho_id, 'empresa_nome', COALESCE(e.nome, ''),
    'subscription', CASE WHEN s.id IS NOT NULL THEN jsonb_build_object('id', s.id, 'status', s.status, 'max_conversas', s.max_conversas, 'conversas_usadas', s.conversas_usadas, 'plano_id', s.plano_id) ELSE NULL END,
    'prompts', (SELECT jsonb_object_agg(pc.key, pc.content) FROM public.config_prompt pc)
  )
  FROM public.agentes_usuario ua
  LEFT JOIN public.profiles p ON p.id = ua.user_id
  LEFT JOIN public.empresas e ON e.user_id = ua.user_id
  LEFT JOIN public.assinaturas_usuario s ON s.user_id = ua.user_id AND s.status IN ('active', 'ativa') AND s.data_expiracao >= now()
  WHERE ua.id = p_agent_id LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.clusterizar_tags_observadas(p_threshold numeric DEFAULT 0.85, p_min_obs integer DEFAULT 3, p_janela_dias integer DEFAULT 7)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_inseridas int := 0;
BEGIN
  WITH tags_frequentes AS (
    SELECT tenant_id, LOWER(TRIM(tag_text)) AS tag_norm, count(*)::int AS num_obs
    FROM public.observacoes_tag
    WHERE criado_em > now() - (p_janela_dias || ' days')::interval
    GROUP BY tenant_id, LOWER(TRIM(tag_text)) HAVING count(*) >= p_min_obs
  ),
  pares AS (
    SELECT a.tenant_id, a.tag_norm AS tag_a, b.tag_norm AS tag_b,
      extensions.similarity(a.tag_norm, b.tag_norm)::numeric(4,3) AS sim,
      CASE WHEN a.num_obs >= b.num_obs THEN a.tag_norm ELSE b.tag_norm END AS canonical
    FROM tags_frequentes a JOIN tags_frequentes b ON a.tenant_id = b.tenant_id AND a.tag_norm < b.tag_norm
    WHERE extensions.similarity(a.tag_norm, b.tag_norm) >= p_threshold
  ),
  inseridos AS (
    INSERT INTO public.sugestoes_fusao_tag (tenant_id, tag_a, tag_b, similarity, suggested_canonical, status, motivo)
    SELECT tenant_id, tag_a, tag_b, sim, canonical, 'pendente', 'cron-clusterizar-tags trgm' FROM pares
    ON CONFLICT DO NOTHING RETURNING id
  )
  SELECT count(*) INTO v_inseridas FROM inseridos;
  RETURN v_inseridas;
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
  INSERT INTO public.leads (tenant_id, name, display_name, phone, email, product, pipeline_stage, client_stage, converted_at, tracking_token, lead_source, lead_temperature)
  VALUES (v_user_id, p_name, p_name, p_phone, p_email, COALESCE(p_product, ''), 'fechado', 'documentacao', now(), v_token, 'manual', 'quente') RETURNING id INTO v_lead_id;
  INSERT INTO public.conversas (tenant_id, lead_id, phone, channel, status, agent_enabled)
  VALUES (v_user_id, v_lead_id, p_phone, 'whatsapp', 'ativa', true) RETURNING id INTO v_conv_id;
  IF v_agent_id IS NOT NULL THEN
    INSERT INTO public.fichas_lead (conversation_id, lead_id, agent_id, ciclo, fase) VALUES (v_conv_id, v_lead_id, v_agent_id, 1, 'fechado');
  END IF;
  RETURN jsonb_build_object('lead_id', v_lead_id, 'conversation_id', v_conv_id, 'tracking_token', v_token);
END;
$function$;

CREATE OR REPLACE FUNCTION public.decrementar_armazenamento(p_user_id uuid, p_bytes bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  UPDATE public.assinaturas_usuario SET storage_used_bytes = GREATEST(0, storage_used_bytes - p_bytes), updated_at = now()
  WHERE user_id = p_user_id AND status IN ('active', 'ativa');
END;
$function$;

CREATE OR REPLACE FUNCTION public.definir_contrato_pdf_url_publico(p_token uuid, p_pdf_url text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE v_contract_id uuid; v_status text;
BEGIN
  IF p_token IS NULL OR p_pdf_url IS NULL OR btrim(p_pdf_url) = '' THEN RAISE EXCEPTION 'token e pdf_url obrigatorios' USING ERRCODE = '22023'; END IF;
  SELECT id, status INTO v_contract_id, v_status FROM public.contratos WHERE token = p_token LIMIT 1;
  IF v_contract_id IS NULL THEN RAISE EXCEPTION 'contrato nao encontrado' USING ERRCODE = 'P0002'; END IF;
  IF v_status NOT IN ('awaiting_validation', 'signed', 'aguardando_validacao', 'assinado') THEN RAISE EXCEPTION 'status invalido para pdf_url' USING ERRCODE = '42501'; END IF;
  PERFORM public.check_public_rate_limit(p_token::text, 'set_contract_pdf_url_public', 3);
  UPDATE public.contratos SET pdf_url = p_pdf_url WHERE id = v_contract_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enfileirar_embedding_admin_ia_memoria()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF (NEW.conteudo IS DISTINCT FROM OLD.conteudo) OR (TG_OP = 'INSERT') THEN
    NEW.embedding_status := 'pendente';
    NEW.embedding := NULL;
    PERFORM pgmq.send('embedding_jobs', jsonb_build_object('table', 'admin_ia_memoria', 'row_id', NEW.id::text, 'text', NEW.conteudo));
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enfileirar_tarefa_embedding()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_text text;
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'blocos_conhecimento' THEN v_text := coalesce(NEW.title, '') || ' ' || coalesce(NEW.content, '');
    WHEN 'blocos_comportamento' THEN v_text := coalesce(NEW.situacao_descricao, '') || ' ' || coalesce(NEW.instrucao, '');
    WHEN 'blocos_humanizacao' THEN v_text := coalesce(NEW.categoria, '') || ' ' || coalesce(NEW.regra, '');
    WHEN 'blocos_gatilho' THEN v_text := coalesce(NEW.nome_trigger, '') || ' ' || coalesce(NEW.exemplo_frase, '');
    WHEN 'blocos_variacao' THEN v_text := coalesce(NEW.nome_variation, '') || ' ' || coalesce(NEW.instrucao, '');
    WHEN 'blocos_meta' THEN v_text := coalesce(NEW.corpo, '');
    WHEN 'emocao_blocos' THEN v_text := coalesce(NEW.emocao, '') || ' ' || coalesce(NEW.corpo, '');
    WHEN 'prova_social_blocos' THEN v_text := coalesce(NEW.depoimento, '') || ' ' || coalesce(NEW.autor, '');
    WHEN 'memoria_episodica' THEN v_text := coalesce(NEW.episodio_resumo, '') || ' ' || coalesce(NEW.emocao, '');
    WHEN 'blocos_procedurais' THEN v_text := coalesce(NEW.nome_procedimento, '') || ' ' || coalesce(NEW.passos::text, '');
    WHEN 'anti_padroes' THEN v_text := coalesce(NEW.situacao, '') || ' ' || coalesce(NEW.acao_correta, '');
    WHEN 'agente_identidade' THEN v_text := coalesce(NEW.dimensao, '') || ' ' || coalesce(NEW.texto, '');
    WHEN 'memoria_lead' THEN v_text := coalesce(NEW.fato, '') || ' ' || coalesce(NEW.categoria, '');
    WHEN 'manipulacao_blocos' THEN v_text := coalesce(NEW.tipo, '') || ' ' || coalesce(NEW.resposta_padrao, '');
    WHEN 'diretriz_bolha_blocos' THEN v_text := coalesce(NEW.contexto, '') || ' ' || coalesce(NEW.motivo, '');
    WHEN 'regras_operacionais_blocos' THEN v_text := coalesce(NEW.contexto, '') || ' ' || coalesce(NEW.regra, '');
    WHEN 'pivots_categoria_intent' THEN v_text := coalesce(NEW.frase_pivo, '');
    WHEN 'automacao_blocos' THEN v_text := coalesce(NEW.nome, '') || ' ' || coalesce(NEW.descricao, '');
    WHEN 'acao_pausa_blocos' THEN v_text := coalesce(NEW.gatilho_descricao, '') || ' ' || coalesce(NEW.gatilho_falas::text, '') || ' ' || coalesce(NEW.mensagem_retorno, '');
    WHEN 'fase_requisitos' THEN v_text := coalesce(NEW.descricao_curta, '') || ' ' || coalesce(NEW.descricao_semantica, '');
    ELSE v_text := NULL;
  END CASE;
  IF v_text IS NOT NULL AND trim(v_text) <> '' THEN
    PERFORM pgmq.send('embedding_jobs', jsonb_build_object('table', TG_TABLE_NAME, 'row_id', NEW.id, 'text', trim(v_text)));
    NEW.embedding_status := 'pendente';
  END IF;
  RETURN NEW;
END;
$function$;
;
