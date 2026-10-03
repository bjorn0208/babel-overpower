
-- Onda D6: tokens de acesso público → chave_publica/chave_rastreamento/chave_sessao

ALTER TABLE public.contratos RENAME COLUMN token TO chave_publica;
ALTER TABLE public.contratos ADD COLUMN token uuid GENERATED ALWAYS AS (chave_publica) STORED;

ALTER TABLE public.leads RENAME COLUMN tracking_token TO chave_rastreamento;
ALTER TABLE public.leads ADD COLUMN tracking_token uuid GENERATED ALWAYS AS (chave_rastreamento) STORED;

ALTER TABLE public.log_acesso_contrato RENAME COLUMN token TO chave_publica;
ALTER TABLE public.log_acesso_contrato ADD COLUMN token uuid GENERATED ALWAYS AS (chave_publica) STORED;

ALTER TABLE public.meta_indicacao_campanha RENAME COLUMN token TO chave_publica;
ALTER TABLE public.meta_indicacao_campanha ADD COLUMN token uuid GENERATED ALWAYS AS (chave_publica) STORED;

ALTER TABLE public.sessoes_chat_publico RENAME COLUMN session_token TO chave_sessao;
ALTER TABLE public.sessoes_chat_publico ADD COLUMN session_token uuid GENERATED ALWAYS AS (chave_sessao) STORED;

-- criar_cliente_manual: tracking_token → chave_rastreamento no INSERT
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
  INSERT INTO public.leads (tenant_id, name, nome_exibicao, phone, email, produto, fase_pipeline, fase_cliente, converted_at, chave_rastreamento, origem_lead, temperatura_lead)
  VALUES (v_user_id, p_name, p_name, p_phone, p_email, COALESCE(p_product, ''), 'fechado', 'documentacao', now(), v_token, 'manual', 'quente') RETURNING id INTO v_lead_id;
  INSERT INTO public.conversas (tenant_id, lead_id, phone, channel, status, agent_enabled)
  VALUES (v_user_id, v_lead_id, p_phone, 'whatsapp', 'ativa', true) RETURNING id INTO v_conv_id;
  IF v_agent_id IS NOT NULL THEN
    INSERT INTO public.fichas_lead (conversation_id, lead_id, agente_id, ciclo, fase) VALUES (v_conv_id, v_lead_id, v_agent_id, 1, 'fechado');
  END IF;
  RETURN jsonb_build_object('lead_id', v_lead_id, 'conversation_id', v_conv_id, 'tracking_token', v_token);
END;
$function$;

-- alternar_checkpoint_publico: WHERE tracking_token → chave_rastreamento (cleanup, generated col aceita read mas mantém PT)
CREATE OR REPLACE FUNCTION public.alternar_checkpoint_publico(p_token uuid, p_checkpoint_id text, p_value boolean)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  UPDATE public.leads
  SET client_checkpoints = jsonb_set(
    COALESCE(client_checkpoints, '{}'::jsonb),
    ARRAY[p_checkpoint_id],
    to_jsonb(p_value)
  )
  WHERE chave_rastreamento = p_token;
$function$;

-- 4 RPCs SELECT cleanup
CREATE OR REPLACE FUNCTION public.conversas_recentes_tenant(p_tenant_id uuid, p_dias integer DEFAULT 30, p_limite integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_resultado jsonb;
BEGIN
  PERFORM set_config('search_path', 'public', true);
  PERFORM set_config('statement_timeout', '5s', true);

  SELECT coalesce(jsonb_agg(t ORDER BY t.created_at DESC), '[]'::jsonb)
  INTO v_resultado
  FROM (
    SELECT c.id, c.lead_id, c.phone, c.status, c.created_at,
           l.name AS lead_name, l.fase_pipeline, l.temperatura_lead, l.is_hot,
           (SELECT COUNT(*) FROM public.mensagens m WHERE m.conversation_id = c.id AND m.deleted_at IS NULL) AS turnos
    FROM public.conversas c
    LEFT JOIN public.leads l ON l.id = c.lead_id
    WHERE c.tenant_id = p_tenant_id
      AND c.created_at > now() - (p_dias || ' days')::interval
      AND c.phone NOT ILIKE 'chat-test-%'
    ORDER BY c.created_at DESC
    LIMIT p_limite
  ) t;

  RETURN v_resultado;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('erro', SQLERRM);
END
$function$;

CREATE OR REPLACE FUNCTION public.conversas_unread_humano(p_tenant_id uuid)
 RETURNS TABLE(conversation_id uuid, ultima_msg_em timestamp with time zone, qtd_msgs_novas integer, needs_human_help boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT
    c.id AS conversation_id,
    MAX(m.created_at) AS ultima_msg_em,
    count(*)::int AS qtd_msgs_novas,
    coalesce(bool_or(l.precisa_humano), false) AS needs_human_help
  FROM public.conversas c
  JOIN public.mensagens m ON m.conversation_id = c.id
  LEFT JOIN public.leads l ON l.id = c.lead_id
  WHERE c.tenant_id = p_tenant_id
    AND c.agent_enabled = false
    AND m.role = 'user'
    AND m.deleted_at IS NULL
    AND m.created_at > coalesce(c.visto_em, '1970-01-01'::timestamptz)
    AND (
      p_tenant_id = (select auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = (select auth.uid()) AND parent_user_id = p_tenant_id
      )
    )
  GROUP BY c.id;
$function$;

CREATE OR REPLACE FUNCTION public.estatisticas_painel(p_tenant_id uuid, p_period_start timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE result jsonb; v_agent_id uuid;
BEGIN
  SELECT id INTO v_agent_id FROM public.agentes_usuario WHERE user_id = p_tenant_id LIMIT 1;
  SELECT jsonb_build_object(
    'leads_ativos', (SELECT count(*) FROM public.leads WHERE tenant_id = p_tenant_id AND phone NOT LIKE 'chat-test%' AND fase_pipeline != 'fechado' AND (p_period_start IS NULL OR created_at >= p_period_start)),
    'clientes_ativos', (SELECT count(*) FROM public.leads WHERE tenant_id = p_tenant_id AND phone NOT LIKE 'chat-test%' AND fase_pipeline = 'fechado' AND (p_period_start IS NULL OR created_at >= p_period_start)),
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
        ) FROM public.fichas_lead WHERE agente_id = v_agent_id)
      ELSE
        (SELECT jsonb_build_object(
          'Saudação', coalesce(sum(CASE WHEN fase_pipeline = 'novo' THEN 1 ELSE 0 END), 0),
          'Qualificação', coalesce(sum(CASE WHEN fase_pipeline = 'qualificando' THEN 1 ELSE 0 END), 0),
          'Apresentação', coalesce(sum(CASE WHEN fase_pipeline = 'apresentando' THEN 1 ELSE 0 END), 0),
          'Negociação', coalesce(sum(CASE WHEN fase_pipeline = 'negociando' THEN 1 ELSE 0 END), 0),
          'Fechamento', coalesce(sum(CASE WHEN fase_pipeline = 'fechado' THEN 1 ELSE 0 END), 0)
        ) FROM public.leads WHERE tenant_id = p_tenant_id AND phone NOT LIKE 'chat-test%' AND (p_period_start IS NULL OR created_at >= p_period_start))
      END),
    'client_phases', (SELECT jsonb_build_object(
        'Documentação', coalesce(sum(CASE WHEN coalesce(fase_cliente,'documentacao') = 'documentacao' THEN 1 ELSE 0 END), 0),
        'Protocolo', coalesce(sum(CASE WHEN fase_cliente = 'protocolo' THEN 1 ELSE 0 END), 0),
        'Em Andamento', coalesce(sum(CASE WHEN fase_cliente = 'andamento' THEN 1 ELSE 0 END), 0),
        'Concluído', coalesce(sum(CASE WHEN fase_cliente = 'concluido' THEN 1 ELSE 0 END), 0)
      ) FROM public.leads WHERE tenant_id = p_tenant_id AND phone NOT LIKE 'chat-test%' AND fase_pipeline = 'fechado'),
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

CREATE OR REPLACE FUNCTION public.metricas_unread_humano(p_tenant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
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
  WHERE l.tenant_id = p_tenant_id AND l.precisa_humano = true AND l.deleted_at IS NULL;
  RETURN jsonb_build_object('atendimento', v_atendimento, 'clientes', v_clientes, 'campanha', v_campanha, 'handoffs_pendentes', v_handoffs, 'total', v_atendimento + v_clientes + v_campanha + v_handoffs);
END;
$function$;

;
