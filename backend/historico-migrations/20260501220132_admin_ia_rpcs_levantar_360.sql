-- Sprint 2 admin-ia · 3 RPCs `levantar_*_360` agregam dados em 1 round trip

CREATE OR REPLACE FUNCTION public.admin_ia_levantar_lead_360(
  p_lead_id uuid,
  p_max_msgs int DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lead jsonb;
  v_conversas jsonb;
  v_msgs jsonb;
  v_belief jsonb;
  v_memory jsonb;
  v_tags jsonb;
  v_scheduled jsonb;
  v_engagement jsonb;
  v_propostas jsonb;
BEGIN
  SELECT to_jsonb(l) INTO v_lead FROM public.leads l WHERE l.id = p_lead_id AND l.deleted_at IS NULL;
  IF v_lead IS NULL THEN RETURN jsonb_build_object('erro', 'lead_nao_encontrado', 'lead_id', p_lead_id); END IF;

  SELECT jsonb_agg(to_jsonb(c) - 'message_buffer' ORDER BY c.updated_at DESC) INTO v_conversas
  FROM public.conversations c WHERE c.lead_id = p_lead_id LIMIT 10;

  SELECT jsonb_agg(jsonb_build_object('id', m.id, 'role', m.role, 'content', LEFT(m.content, 800), 'created_at', m.created_at, 'conversation_id', m.conversation_id) ORDER BY m.created_at DESC)
  INTO v_msgs
  FROM (
    SELECT m.* FROM public.messages m
    WHERE m.conversation_id IN (SELECT id FROM public.conversations WHERE lead_id = p_lead_id)
    ORDER BY m.created_at DESC LIMIT p_max_msgs
  ) m;

  SELECT jsonb_agg(to_jsonb(b) ORDER BY b.updated_at DESC) INTO v_belief
  FROM public.conversation_belief b
  WHERE b.conversation_id IN (SELECT id FROM public.conversations WHERE lead_id = p_lead_id)
  LIMIT 5;

  SELECT jsonb_agg(jsonb_build_object('fato', lm.fato, 'categoria', lm.categoria, 'fonte', lm.fonte, 'criado_em', lm.criado_em, 'confianca', lm.confianca) ORDER BY lm.criado_em DESC)
  INTO v_memory FROM public.lead_memory lm WHERE lm.lead_id = p_lead_id AND lm.ativa = true LIMIT 50;

  SELECT jsonb_agg(jsonb_build_object('tag_text', t.tag_text, 'fonte', t.fonte, 'emocao_dominante', t.emocao_dominante, 'criado_em', t.criado_em) ORDER BY t.criado_em DESC)
  INTO v_tags FROM public.tag_observations t WHERE t.lead_id = p_lead_id LIMIT 50;

  SELECT jsonb_agg(jsonb_build_object('id', s.id, 'status', s.status, 'agendado_para', s.agendado_para, 'tipo', s.tipo, 'criado_em', s.created_at) ORDER BY s.agendado_para)
  INTO v_scheduled FROM public.scheduled_actions s WHERE s.lead_id = p_lead_id ORDER BY s.agendado_para LIMIT 20;

  SELECT to_jsonb(e) INTO v_engagement FROM public.lead_engagement e WHERE e.lead_id = p_lead_id ORDER BY e.created_at DESC LIMIT 1;

  SELECT jsonb_agg(jsonb_build_object('id', p.id, 'tipo', p.tipo, 'status', p.status, 'titulo', p.titulo, 'criado_em', p.criado_em) ORDER BY p.criado_em DESC)
  INTO v_propostas FROM public.admin_ia_propostas p
  WHERE (p.payload->>'lead_id')::uuid = p_lead_id LIMIT 10;

  RETURN jsonb_build_object(
    'lead', v_lead,
    'conversas', COALESCE(v_conversas, '[]'::jsonb),
    'mensagens_recentes', COALESCE(v_msgs, '[]'::jsonb),
    'belief', COALESCE(v_belief, '[]'::jsonb),
    'lead_memory', COALESCE(v_memory, '[]'::jsonb),
    'tag_observations', COALESCE(v_tags, '[]'::jsonb),
    'scheduled_actions', COALESCE(v_scheduled, '[]'::jsonb),
    'lead_engagement', v_engagement,
    'propostas_admin_ia', COALESCE(v_propostas, '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_ia_levantar_tenant_360(
  p_tenant_id uuid,
  p_periodo_dias int DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_perfil jsonb; v_produtos jsonb; v_agentes jsonb; v_campanhas jsonb;
  v_metricas jsonb; v_chunks jsonb;
BEGIN
  SELECT to_jsonb(p) - 'avatar_url' INTO v_perfil FROM public.profiles p WHERE p.id = p_tenant_id;
  IF v_perfil IS NULL THEN RETURN jsonb_build_object('erro', 'tenant_nao_encontrado', 'tenant_id', p_tenant_id); END IF;

  SELECT jsonb_agg(jsonb_build_object('id', pr.id, 'nome', pr.nome, 'tipo', pr.tipo, 'preco', pr.preco) ORDER BY pr.created_at DESC)
  INTO v_produtos FROM public.produtos pr WHERE pr.user_id = p_tenant_id LIMIT 30;

  SELECT jsonb_agg(jsonb_build_object('id', ua.id, 'nome', ua.nome, 'created_at', ua.created_at))
  INTO v_agentes FROM public.user_agents ua WHERE ua.user_id = p_tenant_id LIMIT 10;

  SELECT jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome, 'tipo', c.tipo, 'status', c.status, 'created_at', c.created_at) ORDER BY c.created_at DESC)
  INTO v_campanhas FROM public.campaigns c WHERE c.tenant_id = p_tenant_id AND c.deleted_at IS NULL LIMIT 30;

  v_metricas := jsonb_build_object(
    'leads_total', (SELECT count(*) FROM public.leads WHERE tenant_id = p_tenant_id AND deleted_at IS NULL),
    'leads_ult_periodo', (SELECT count(*) FROM public.leads WHERE tenant_id = p_tenant_id AND deleted_at IS NULL AND created_at >= now() - (p_periodo_dias || ' days')::interval),
    'conversas_total', (SELECT count(*) FROM public.conversations WHERE tenant_id = p_tenant_id),
    'conversas_active', (SELECT count(*) FROM public.conversations WHERE tenant_id = p_tenant_id AND status = 'active'),
    'leads_dados_ficha_preenchida', (SELECT count(*) FROM public.leads WHERE tenant_id = p_tenant_id AND deleted_at IS NULL AND dados_ficha IS NOT NULL AND dados_ficha::text != '{}'),
    'tag_observations_ult_periodo', (SELECT count(*) FROM public.tag_observations WHERE tenant_id = p_tenant_id AND criado_em >= now() - (p_periodo_dias || ' days')::interval)
  );

  SELECT jsonb_agg(jsonb_build_object('tabela', kc.tabela, 'count', kc.n))
  INTO v_chunks FROM (
    SELECT 'knowledge' AS tabela, count(*) AS n FROM public.knowledge_chunks WHERE tenant_id = p_tenant_id AND ativo = true
    UNION ALL SELECT 'behavior', count(*) FROM public.behavior_chunks WHERE tenant_id = p_tenant_id AND ativo = true
    UNION ALL SELECT 'trigger', count(*) FROM public.trigger_chunks WHERE tenant_id = p_tenant_id AND ativo = true
    UNION ALL SELECT 'human', count(*) FROM public.human_chunks WHERE tenant_id = p_tenant_id AND ativo = true
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
$$;

CREATE OR REPLACE FUNCTION public.admin_ia_levantar_conversa_360(
  p_conv_id uuid,
  p_max_msgs int DEFAULT 80
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_conv jsonb; v_msgs jsonb; v_belief jsonb; v_scheduled jsonb;
  v_lead jsonb;
BEGIN
  SELECT to_jsonb(c) - 'message_buffer' INTO v_conv FROM public.conversations c WHERE c.id = p_conv_id;
  IF v_conv IS NULL THEN RETURN jsonb_build_object('erro', 'conversa_nao_encontrada', 'conversation_id', p_conv_id); END IF;

  SELECT jsonb_agg(jsonb_build_object('id', m.id, 'role', m.role, 'content', LEFT(m.content, 1000), 'created_at', m.created_at) ORDER BY m.created_at)
  INTO v_msgs
  FROM (SELECT * FROM public.messages WHERE conversation_id = p_conv_id ORDER BY created_at DESC LIMIT p_max_msgs) m;

  SELECT jsonb_agg(to_jsonb(b) ORDER BY b.updated_at DESC) INTO v_belief
  FROM public.conversation_belief b WHERE b.conversation_id = p_conv_id LIMIT 5;

  SELECT jsonb_agg(jsonb_build_object('id', s.id, 'tipo', s.tipo, 'status', s.status, 'agendado_para', s.agendado_para, 'criado_em', s.created_at) ORDER BY s.agendado_para)
  INTO v_scheduled FROM public.scheduled_actions s WHERE s.conversation_id = p_conv_id LIMIT 20;

  SELECT to_jsonb(l) INTO v_lead FROM public.leads l
  WHERE l.id = (v_conv->>'lead_id')::uuid LIMIT 1;

  RETURN jsonb_build_object(
    'conversa', v_conv,
    'mensagens', COALESCE(v_msgs, '[]'::jsonb),
    'belief', COALESCE(v_belief, '[]'::jsonb),
    'scheduled_actions', COALESCE(v_scheduled, '[]'::jsonb),
    'lead', v_lead
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_ia_levantar_lead_360(uuid, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_ia_levantar_tenant_360(uuid, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_ia_levantar_conversa_360(uuid, int) TO service_role;
;
