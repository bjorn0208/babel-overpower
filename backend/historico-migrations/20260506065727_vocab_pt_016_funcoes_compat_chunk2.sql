-- Migration 16 chunk 2: 14 funções

CREATE OR REPLACE FUNCTION public.enviar_para_base(p_lead_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  IF NOT public._lead_pertence_caller(p_lead_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.leads SET location = 'base', updated_at = now() WHERE id = p_lead_id AND deleted_at IS NULL;
  UPDATE public.conversas SET status = 'encerrada', agent_enabled = false, updated_at = now() WHERE lead_id = p_lead_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enviar_reproposta(p_campaign_lead_ids uuid[], p_texto text DEFAULT NULL::text)
 RETURNS TABLE(campaign_lead_id uuid, reproposta_id uuid, scheduled_action_id uuid, status text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
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
    SELECT co.id, co.agent_id INTO v_conv, v_agent FROM public.conversas co
    WHERE co.lead_id = v_rec.lead_id AND co.tenant_id = v_rec.tenant_id ORDER BY co.updated_at DESC NULLS LAST LIMIT 1;
    INSERT INTO public.acoes_agendadas (lead_id, conversation_id, agent_id, action_type, scheduled_at, status, payload)
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

CREATE OR REPLACE FUNCTION public.estatisticas_painel(p_tenant_id uuid, p_period_start timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE result jsonb; v_agent_id uuid;
BEGIN
  SELECT id INTO v_agent_id FROM public.agentes_usuario WHERE user_id = p_tenant_id LIMIT 1;
  SELECT jsonb_build_object(
    'leads_ativos', (SELECT count(*) FROM public.leads WHERE tenant_id = p_tenant_id AND phone NOT LIKE 'chat-test%' AND pipeline_stage != 'fechado' AND (p_period_start IS NULL OR created_at >= p_period_start)),
    'clientes_ativos', (SELECT count(*) FROM public.leads WHERE tenant_id = p_tenant_id AND phone NOT LIKE 'chat-test%' AND pipeline_stage = 'fechado' AND (p_period_start IS NULL OR created_at >= p_period_start)),
    'total_leads', (SELECT count(*) FROM public.leads WHERE tenant_id = p_tenant_id AND phone NOT LIKE 'chat-test%' AND (p_period_start IS NULL OR created_at >= p_period_start)),
    'convs_count', (SELECT count(*) FROM public.conversas WHERE tenant_id = p_tenant_id AND phone NOT LIKE 'chat-test%' AND (p_period_start IS NULL OR created_at >= p_period_start)),
    'contracts_count', (SELECT count(*) FROM public.contratos WHERE tenant_id = p_tenant_id),
    'msgs_by_role', (SELECT jsonb_build_object(
        'assistant', coalesce(sum(CASE WHEN m.role = 'assistant' THEN 1 ELSE 0 END), 0),
        'user', coalesce(sum(CASE WHEN m.role = 'user' THEN 1 ELSE 0 END), 0),
        'human', coalesce(sum(CASE WHEN m.role IN ('human','humano') THEN 1 ELSE 0 END), 0)
      ) FROM public.mensagens m JOIN public.conversas c ON c.id = m.conversation_id WHERE c.tenant_id = p_tenant_id AND (p_period_start IS NULL OR m.created_at >= p_period_start)),
    'funnel', (SELECT CASE WHEN v_agent_id IS NOT NULL THEN
        (SELECT jsonb_build_object(
          'Saudação', coalesce(sum(CASE WHEN lower(fase) = 'saudacao' THEN 1 ELSE 0 END), 0),
          'Qualificação', coalesce(sum(CASE WHEN lower(fase) = 'qualificacao' THEN 1 ELSE 0 END), 0),
          'Apresentação', coalesce(sum(CASE WHEN lower(fase) = 'apresentacao' THEN 1 ELSE 0 END), 0),
          'Negociação', coalesce(sum(CASE WHEN lower(fase) = 'negociacao' THEN 1 ELSE 0 END), 0),
          'Fechamento', coalesce(sum(CASE WHEN lower(fase) IN ('fechamento','fechado') THEN 1 ELSE 0 END), 0)
        ) FROM public.fichas_lead WHERE agent_id = v_agent_id)
      ELSE
        (SELECT jsonb_build_object(
          'Saudação', coalesce(sum(CASE WHEN pipeline_stage = 'novo' THEN 1 ELSE 0 END), 0),
          'Qualificação', coalesce(sum(CASE WHEN pipeline_stage = 'qualificando' THEN 1 ELSE 0 END), 0),
          'Apresentação', coalesce(sum(CASE WHEN pipeline_stage = 'apresentando' THEN 1 ELSE 0 END), 0),
          'Negociação', coalesce(sum(CASE WHEN pipeline_stage = 'negociando' THEN 1 ELSE 0 END), 0),
          'Fechamento', coalesce(sum(CASE WHEN pipeline_stage = 'fechado' THEN 1 ELSE 0 END), 0)
        ) FROM public.leads WHERE tenant_id = p_tenant_id AND phone NOT LIKE 'chat-test%' AND (p_period_start IS NULL OR created_at >= p_period_start))
      END),
    'client_phases', (SELECT jsonb_build_object(
        'Documentação', coalesce(sum(CASE WHEN coalesce(client_stage,'documentacao') = 'documentacao' THEN 1 ELSE 0 END), 0),
        'Protocolo', coalesce(sum(CASE WHEN client_stage = 'protocolo' THEN 1 ELSE 0 END), 0),
        'Em Andamento', coalesce(sum(CASE WHEN client_stage = 'andamento' THEN 1 ELSE 0 END), 0),
        'Concluído', coalesce(sum(CASE WHEN client_stage = 'concluido' THEN 1 ELSE 0 END), 0)
      ) FROM public.leads WHERE tenant_id = p_tenant_id AND phone NOT LIKE 'chat-test%' AND pipeline_stage = 'fechado'),
    'peak_hours', (SELECT jsonb_build_object(
        '06h', coalesce(sum(CASE WHEN extract(hour FROM m.created_at) BETWEEN 6 AND 7 THEN 1 ELSE 0 END), 0),
        '08h', coalesce(sum(CASE WHEN extract(hour FROM m.created_at) BETWEEN 8 AND 9 THEN 1 ELSE 0 END), 0),
        '10h', coalesce(sum(CASE WHEN extract(hour FROM m.created_at) BETWEEN 10 AND 11 THEN 1 ELSE 0 END), 0),
        '12h', coalesce(sum(CASE WHEN extract(hour FROM m.created_at) BETWEEN 12 AND 13 THEN 1 ELSE 0 END), 0),
        '14h', coalesce(sum(CASE WHEN extract(hour FROM m.created_at) BETWEEN 14 AND 15 THEN 1 ELSE 0 END), 0),
        '16h', coalesce(sum(CASE WHEN extract(hour FROM m.created_at) BETWEEN 16 AND 17 THEN 1 ELSE 0 END), 0),
        '18h', coalesce(sum(CASE WHEN extract(hour FROM m.created_at) BETWEEN 18 AND 19 THEN 1 ELSE 0 END), 0),
        '20h', coalesce(sum(CASE WHEN extract(hour FROM m.created_at) BETWEEN 20 AND 21 THEN 1 ELSE 0 END), 0),
        '22h', coalesce(sum(CASE WHEN extract(hour FROM m.created_at) BETWEEN 22 AND 23 THEN 1 ELSE 0 END), 0)
      ) FROM public.mensagens m JOIN public.conversas c ON c.id = m.conversation_id
      WHERE c.tenant_id = p_tenant_id AND m.role = 'user' AND (p_period_start IS NULL OR m.created_at >= p_period_start)),
    'human_conv_ids', (SELECT coalesce(jsonb_agg(DISTINCT m.conversation_id), '[]'::jsonb)
      FROM public.mensagens m JOIN public.conversas c ON c.id = m.conversation_id
      WHERE c.tenant_id = p_tenant_id AND m.role IN ('human','humano') AND (p_period_start IS NULL OR m.created_at >= p_period_start))
  ) INTO result;
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.excluir_campanha(p_campaign_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_caller uuid := auth.uid(); v_tenant uuid; v_is_admin boolean; v_is_team_member boolean;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT tenant_id INTO v_tenant FROM public.campanhas WHERE id = p_campaign_id AND deleted_at IS NULL;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  v_is_admin := public.is_platform_admin();
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_caller AND p.parent_user_id = v_tenant) INTO v_is_team_member;
  IF NOT (v_tenant = v_caller OR v_is_admin OR v_is_team_member) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.campanhas SET deleted_at = now(), status = 'pausada', updated_at = now() WHERE id = p_campaign_id;
  UPDATE public.leads_campanha SET state = 'desistente', exit_reason = 'campanha_deletada', closed_at = now()
  WHERE campaign_id = p_campaign_id AND state = 'ativo';
  UPDATE public.acoes_agendadas SET status = 'cancelado'
  WHERE action_type IN ('campaign_trigger','campaign_reproposta') AND status IN ('pending','pendente') AND campaign_id = p_campaign_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.existe_compromisso_ativo(p_conversation_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.acoes_agendadas sa
    WHERE sa.conversation_id = p_conversation_id AND sa.status IN ('pending','pendente')
      AND (sa.action_type IN ('agendamento_callback','agendamento_retorno','lembrete_retorno','iniciar_atendimento','retomada_planejada')
           OR (sa.action_type IN ('cobranca_pagamento','cobranca_assinatura') AND sa.payload->>'origem' IN ('trigger_promessa_data','trigger_promessa_assinatura')))
      AND sa.scheduled_at > now()
  );
$function$;

CREATE OR REPLACE FUNCTION public.expirar_assinaturas()
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  UPDATE public.assinaturas_usuario SET status = 'expirada', updated_at = now()
  WHERE status IN ('active','ativa') AND data_expiracao < now();
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_arquivar_leads_no_fim_campanha()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO ''
AS $function$
BEGIN
  IF ((OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('finished','finalizada'))
      OR (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)) THEN
    UPDATE public.leads_campanha SET archived_at = COALESCE(archived_at, now()) WHERE campaign_id = NEW.id AND archived_at IS NULL;
    UPDATE public.leads l SET location = CASE WHEN l.converted_at IS NOT NULL THEN 'cliente' ELSE 'base' END, updated_at = now()
    FROM public.leads_campanha cl WHERE cl.campaign_id = NEW.id AND cl.lead_id = l.id AND l.deleted_at IS NULL;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_sincronizar_acao_agendada_para_compromisso()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_descricao text; v_tenant_id uuid; v_eh_compromisso boolean; v_origem text; v_assunto text; v_angulo text;
BEGIN
  v_origem := NEW.payload->>'origem';
  v_eh_compromisso := NEW.action_type IN ('agendamento_callback','agendamento_retorno','lembrete_retorno','iniciar_atendimento','planejar_retomada','retomada_planejada');
  IF NOT v_eh_compromisso AND NEW.action_type IN ('cobranca_pagamento','cobranca_assinatura') THEN
    v_eh_compromisso := v_origem IN ('trigger_promessa_data','trigger_promessa_assinatura');
  END IF;
  IF NOT v_eh_compromisso THEN RETURN NEW; END IF;
  IF NEW.scheduled_at IS NULL THEN RETURN NEW; END IF;
  v_tenant_id := NEW.tenant_id;
  IF v_tenant_id IS NULL AND NEW.conversation_id IS NOT NULL THEN
    SELECT c.tenant_id INTO v_tenant_id FROM public.conversas c WHERE c.id = NEW.conversation_id;
  END IF;
  IF v_tenant_id IS NULL THEN RETURN NEW; END IF;
  v_assunto := NEW.payload->>'assunto'; v_angulo := NEW.payload->>'angulo';
  v_descricao := CASE NEW.action_type
    WHEN 'agendamento_callback' THEN 'Retorno agendado' || coalesce(' · ' || (NEW.payload->>'data_original'), '')
    WHEN 'agendamento_retorno' THEN 'Retorno agendado' || coalesce(' · ' || (NEW.payload->>'data_original'), '') || coalesce(' · ' || (NEW.payload->>'motivo'), '')
    WHEN 'lembrete_retorno' THEN 'Lembrete antes do callback'
    WHEN 'iniciar_atendimento' THEN 'Iniciar atendimento'
    WHEN 'cobranca_pagamento' THEN 'Pagamento prometido pelo lead' || coalesce(' · ' || (NEW.payload->>'tom'), '')
    WHEN 'cobranca_assinatura' THEN 'Assinatura prometida pelo lead' || coalesce(' · ' || (NEW.payload->>'tom'), '')
    WHEN 'planejar_retomada' THEN 'Avaliando retomada' || coalesce(' · ' || (NEW.payload->>'condicao_tipo'), '')
    WHEN 'retomada_planejada' THEN 'Retomada planejada' || coalesce(' · ' || v_assunto, '') || coalesce(' (' || v_angulo || ')', '')
    ELSE 'Compromisso'
  END;
  IF NEW.payload->>'descricao' IS NOT NULL THEN v_descricao := NEW.payload->>'descricao'; END IF;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.compromissos (conversation_id, lead_id, tenant_id, descricao, scheduled_at, origem, status, scheduled_action_id)
    VALUES (NEW.conversation_id, NEW.lead_id, v_tenant_id, v_descricao, NEW.scheduled_at, 'autonomo', 'pendente', NEW.id)
    ON CONFLICT (scheduled_action_id) WHERE scheduled_action_id IS NOT NULL DO NOTHING;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NEW.status IN ('executed','done','executado') THEN
        UPDATE public.compromissos SET status = 'cumprido', cumprido_em = coalesce(NEW.executed_at, now())
        WHERE scheduled_action_id = NEW.id AND status = 'pendente';
      ELSIF NEW.status IN ('cancelled','cancelado') THEN
        UPDATE public.compromissos SET status = 'cancelado' WHERE scheduled_action_id = NEW.id AND status = 'pendente';
      END IF;
    END IF;
    IF NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at THEN
      UPDATE public.compromissos SET scheduled_at = NEW.scheduled_at, descricao = v_descricao
      WHERE scheduled_action_id = NEW.id AND status = 'pendente';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.gerar_sugestoes_fusao_tag(p_nicho_id uuid, p_threshold numeric DEFAULT 0.85, p_min_leads integer DEFAULT 1)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_count integer := 0;
BEGIN
  IF p_nicho_id IS NULL THEN RAISE EXCEPTION 'nicho_id obrigatorio'; END IF;
  DELETE FROM public.sugestoes_fusao_tag WHERE nicho_id = p_nicho_id AND status IN ('pending','pendente');
  CREATE TEMP TABLE IF NOT EXISTS _pares (tag_a text, tag_b text, sim numeric) ON COMMIT DROP;
  TRUNCATE _pares;
  INSERT INTO _pares
  SELECT a.tag_text, b.tag_text, 1 - (a.embedding <=> b.embedding) AS sim
  FROM public.candidatos_tag a JOIN public.candidatos_tag b
    ON a.nicho_id = b.nicho_id AND a.tag_text < b.tag_text AND a.embedding IS NOT NULL AND b.embedding IS NOT NULL
  WHERE a.nicho_id = p_nicho_id AND a.num_leads_independentes >= p_min_leads AND b.num_leads_independentes >= p_min_leads
    AND 1 - (a.embedding <=> b.embedding) >= p_threshold;
  CREATE TEMP TABLE IF NOT EXISTS _vertices (tag text PRIMARY KEY) ON COMMIT DROP;
  TRUNCATE _vertices;
  INSERT INTO _vertices SELECT DISTINCT tag_a FROM _pares UNION SELECT DISTINCT tag_b FROM _pares;
  CREATE TEMP TABLE IF NOT EXISTS _arestas_bid (a text, b text) ON COMMIT DROP;
  TRUNCATE _arestas_bid;
  INSERT INTO _arestas_bid SELECT tag_a, tag_b FROM _pares
    UNION ALL SELECT tag_b, tag_a FROM _pares
    UNION ALL SELECT tag, tag FROM _vertices;
  CREATE TEMP TABLE IF NOT EXISTS _componentes (tag text PRIMARY KEY, root text) ON COMMIT DROP;
  TRUNCATE _componentes;
  WITH RECURSIVE alcanc AS (
    SELECT tag AS origem, tag AS atual FROM _vertices
    UNION SELECT al.origem, e.b FROM alcanc al JOIN _arestas_bid e ON e.a = al.atual
  )
  INSERT INTO _componentes SELECT origem, MIN(atual) FROM alcanc GROUP BY origem;
  INSERT INTO public.sugestoes_fusao_tag (nicho_id, tags, suggested_canonical, similarity, status, motivo, criado_em, tag_a, tag_b)
  SELECT p_nicho_id, cluster_tags, canonical, avg_sim, 'pendente',
    format('cluster=%s tags leads_canonica=%s', array_length(cluster_tags, 1), max_leads),
    now(), cluster_tags[1],
    CASE WHEN array_length(cluster_tags, 1) >= 2 THEN cluster_tags[2] ELSE cluster_tags[1] END
  FROM (
    SELECT c.root, array_agg(DISTINCT c.tag ORDER BY c.tag) AS cluster_tags,
      (SELECT tc.tag_text FROM public.candidatos_tag tc
       WHERE tc.nicho_id = p_nicho_id AND tc.tag_text = ANY(array_agg(DISTINCT c.tag))
       ORDER BY tc.num_leads_independentes DESC, tc.criado_em ASC LIMIT 1) AS canonical,
      (SELECT MAX(tc.num_leads_independentes) FROM public.candidatos_tag tc
       WHERE tc.nicho_id = p_nicho_id AND tc.tag_text = ANY(array_agg(DISTINCT c.tag))) AS max_leads,
      (SELECT COALESCE(AVG(p.sim), 0) FROM _pares p
       WHERE p.tag_a = ANY(array_agg(DISTINCT c.tag)) AND p.tag_b = ANY(array_agg(DISTINCT c.tag))) AS avg_sim
    FROM _componentes c GROUP BY c.root HAVING count(DISTINCT c.tag) >= 2
  ) clusters;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_conversas_usadas(p_tenant_id uuid)
 RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT COUNT(*)::int FROM public.tickets_conversa ct
  WHERE ct.tenant_id = p_tenant_id
    AND ct.created_at >= (SELECT data_inicio FROM public.assinaturas_usuario
      WHERE user_id = p_tenant_id AND status IN ('active','ativa') LIMIT 1);
$function$;

CREATE OR REPLACE FUNCTION public.marcar_handoff_atendido(p_lead_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_tenant uuid; v_caller uuid := (select auth.uid());
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.leads WHERE id = p_lead_id;
  IF v_tenant IS NULL THEN RETURN; END IF;
  IF v_tenant != v_caller AND NOT public.is_platform_admin()
     AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_caller AND parent_user_id = v_tenant) THEN
    RAISE EXCEPTION 'sem permissao pra atender handoff';
  END IF;
  UPDATE public.leads SET needs_human_help = false WHERE id = p_lead_id;
  UPDATE public.conversas SET visto_em = now(), status = 'humano', agent_enabled = false WHERE lead_id = p_lead_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.metricas_unread_humano(p_tenant_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_caller uuid := (select auth.uid()); v_atendimento int; v_clientes int; v_campanha int; v_handoffs int;
BEGIN
  IF p_tenant_id != v_caller AND NOT public.is_platform_admin()
     AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_caller AND parent_user_id = p_tenant_id) THEN
    RAISE EXCEPTION 'sem permissao pra ver metricas do tenant';
  END IF;
  SELECT count(DISTINCT c.id) INTO v_atendimento FROM public.conversas c JOIN public.leads l ON l.id = c.lead_id
  WHERE c.tenant_id = p_tenant_id AND c.agent_enabled = false AND coalesce(c.status,'ativa') != 'campaign'
    AND l.location = 'atendimento' AND l.deleted_at IS NULL
    AND EXISTS (SELECT 1 FROM public.mensagens m WHERE m.conversation_id = c.id AND m.role = 'user' AND m.deleted_at IS NULL AND m.created_at > coalesce(c.visto_em,'1970-01-01'::timestamptz));
  SELECT count(DISTINCT c.id) INTO v_clientes FROM public.conversas c JOIN public.leads l ON l.id = c.lead_id
  WHERE c.tenant_id = p_tenant_id AND c.agent_enabled = false AND l.location = 'cliente' AND l.deleted_at IS NULL
    AND EXISTS (SELECT 1 FROM public.mensagens m WHERE m.conversation_id = c.id AND m.role = 'user' AND m.deleted_at IS NULL AND m.created_at > coalesce(c.visto_em,'1970-01-01'::timestamptz));
  SELECT count(DISTINCT c.id) INTO v_campanha FROM public.conversas c
  WHERE c.tenant_id = p_tenant_id AND c.agent_enabled = false
    AND (c.status = 'campaign' OR EXISTS (SELECT 1 FROM public.leads_campanha cl WHERE cl.lead_id = c.lead_id AND cl.state = 'ativo'))
    AND EXISTS (SELECT 1 FROM public.mensagens m WHERE m.conversation_id = c.id AND m.role = 'user' AND m.deleted_at IS NULL AND m.created_at > coalesce(c.visto_em,'1970-01-01'::timestamptz));
  SELECT count(DISTINCT l.id) INTO v_handoffs FROM public.leads l
  WHERE l.tenant_id = p_tenant_id AND l.needs_human_help = true AND l.deleted_at IS NULL;
  RETURN jsonb_build_object('atendimento', v_atendimento, 'clientes', v_clientes, 'campanha', v_campanha, 'handoffs_pendentes', v_handoffs, 'total', v_atendimento + v_clientes + v_campanha + v_handoffs);
END;
$function$;

CREATE OR REPLACE FUNCTION public.obter_metricas_campanha(p_campaign_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_caller uuid := auth.uid(); v_tenant uuid; v_ativos integer; v_fechados integer; v_desistentes integer; v_repropostas integer; v_proximos jsonb;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT tenant_id INTO v_tenant FROM public.campanhas WHERE id = p_campaign_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT (v_tenant = v_caller OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_caller AND p.parent_user_id = v_tenant) OR public.is_platform_admin()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT COUNT(*) FILTER (WHERE state = 'ativo' AND archived_at IS NULL),
         COUNT(*) FILTER (WHERE state = 'fechado' AND archived_at IS NULL),
         COUNT(*) FILTER (WHERE state = 'desistente' AND archived_at IS NULL)
  INTO v_ativos, v_fechados, v_desistentes FROM public.leads_campanha WHERE campaign_id = p_campaign_id;
  SELECT COUNT(*) INTO v_repropostas FROM public.repropostas_lead_campanha clr
  JOIN public.leads_campanha cl ON cl.id = clr.campaign_lead_id WHERE cl.campaign_id = p_campaign_id;
  SELECT COALESCE(jsonb_agg(rows ORDER BY rows->>'scheduled_at' ASC), '[]'::jsonb) INTO v_proximos
  FROM (SELECT jsonb_build_object('id', sa.id, 'lead_id', sa.lead_id, 'action_type', sa.action_type, 'scheduled_at', sa.scheduled_at) AS rows
    FROM public.acoes_agendadas sa WHERE sa.campaign_id = p_campaign_id AND sa.status IN ('pending','pendente') AND sa.action_type LIKE 'campaign%'
    ORDER BY sa.scheduled_at ASC LIMIT 10) t;
  RETURN jsonb_build_object('ativos', v_ativos, 'fechados', v_fechados, 'desistentes', v_desistentes, 'repropostas', v_repropostas, 'proximos_10', v_proximos);
END;
$function$;

CREATE OR REPLACE FUNCTION public.obter_uso_armazenamento(p_user_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'used_bytes', COALESCE(storage_used_bytes, 0),
    'max_bytes', COALESCE(max_storage_bytes, 209715200),
    'used_mb', ROUND(COALESCE(storage_used_bytes, 0) / 1048576.0, 1),
    'max_mb', ROUND(COALESCE(max_storage_bytes, 209715200) / 1048576.0, 0),
    'percent', CASE WHEN max_storage_bytes > 0 THEN ROUND(COALESCE(storage_used_bytes, 0) * 100.0 / max_storage_bytes, 1) ELSE 0 END
  ) INTO v_result FROM public.assinaturas_usuario WHERE user_id = p_user_id AND status IN ('active','ativa') LIMIT 1;
  RETURN COALESCE(v_result, '{"used_bytes":0,"max_bytes":209715200,"used_mb":0,"max_mb":200,"percent":0}'::jsonb);
END;
$function$;
;
