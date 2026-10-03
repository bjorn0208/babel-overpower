-- Sprint 2 v2 · ajustes nos schemas reais

CREATE OR REPLACE VIEW public.v_leads_por_fase_tenant AS
SELECT tenant_id,
       pipeline_stage AS fase,
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE updated_at > now() - interval '7 days') AS ultimos_7d
FROM public.leads
WHERE deleted_at IS NULL
GROUP BY tenant_id, pipeline_stage;

CREATE OR REPLACE VIEW public.v_conversas_status_dia AS
SELECT tenant_id,
       DATE(created_at) AS dia,
       status,
       COUNT(*) AS total
FROM public.conversations
WHERE created_at > now() - interval '30 days'
GROUP BY tenant_id, DATE(created_at), status;

CREATE OR REPLACE VIEW public.v_custo_por_modelo_dia AS
SELECT model_slug,
       DATE(created_at) AS dia,
       COUNT(*) AS chamadas,
       SUM(custo_total) AS custo_total,
       AVG(duracao_ms) AS latencia_media
FROM public.llm_request_logs
WHERE created_at > now() - interval '30 days'
GROUP BY model_slug, DATE(created_at);

CREATE OR REPLACE VIEW public.v_top_erros_dia AS
SELECT DATE(criado_em) AS dia,
       motivo_falha,
       COUNT(*) AS total,
       array_agg(DISTINCT tenant_id) FILTER (WHERE tenant_id IS NOT NULL) AS tenants_afetados
FROM public.reflection_log
WHERE criado_em > now() - interval '14 days' AND deleted_at IS NULL
GROUP BY DATE(criado_em), motivo_falha;

CREATE OR REPLACE VIEW public.v_saude_cronjobs AS
SELECT cronjob_nome,
       COUNT(*) AS execucoes_30d,
       COUNT(*) FILTER (WHERE resultado = 'sucesso') AS sucessos,
       COUNT(*) FILTER (WHERE resultado = 'erro') AS erros,
       MAX(iniciou_em) AS ultima_execucao,
       AVG(duracao_ms) AS duracao_media_ms
FROM public.cronjobs_log
WHERE iniciou_em > now() - interval '30 days'
GROUP BY cronjob_nome;

CREATE OR REPLACE VIEW public.v_gargalos_campanha_tenant AS
SELECT c.tenant_id,
       c.id AS campaign_id,
       c.name AS campaign_name,
       cl.phase AS fase,
       COUNT(*) AS leads_na_fase,
       AVG(EXTRACT(EPOCH FROM (now() - cl.entered_at))/3600) AS horas_medias_na_fase
FROM public.campaign_leads cl
JOIN public.campaigns c ON c.id = cl.campaign_id
WHERE cl.entered_at > now() - interval '30 days'
GROUP BY c.tenant_id, c.id, c.name, cl.phase
HAVING COUNT(*) >= 3;

CREATE OR REPLACE FUNCTION public.estado_curadoria_completo()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_resultado jsonb;
BEGIN
  PERFORM set_config('search_path', 'public', true);
  PERFORM set_config('statement_timeout', '5s', true);

  SELECT jsonb_build_object(
    'gavetas', jsonb_build_object(
      'knowledge_chunks',     (SELECT COUNT(*) FROM public.knowledge_chunks WHERE ativo IS NOT FALSE),
      'behavior_chunks',      (SELECT COUNT(*) FROM public.behavior_chunks WHERE ativo IS NOT FALSE),
      'trigger_chunks',       (SELECT COUNT(*) FROM public.trigger_chunks WHERE ativo IS NOT FALSE),
      'human_chunks',         (SELECT COUNT(*) FROM public.human_chunks WHERE ativo IS NOT FALSE),
      'variation_chunks',     (SELECT COUNT(*) FROM public.variation_chunks WHERE ativo IS NOT FALSE),
      'meta_chunks',          (SELECT COUNT(*) FROM public.meta_chunks WHERE ativo IS NOT FALSE),
      'procedural_chunks',    (SELECT COUNT(*) FROM public.procedural_chunks WHERE ativo IS NOT FALSE),
      'emocao_chunks',        (SELECT COUNT(*) FROM public.emocao_chunks WHERE ativo IS NOT FALSE),
      'prova_social_chunks',  (SELECT COUNT(*) FROM public.prova_social_chunks WHERE ativo IS NOT FALSE),
      'manipulacao_chunks',   (SELECT COUNT(*) FROM public.manipulacao_chunks WHERE ativo IS NOT FALSE),
      'diretriz_bolha_chunks',(SELECT COUNT(*) FROM public.diretriz_bolha_chunks WHERE ativo IS NOT FALSE),
      'automacao_chunks',     (SELECT COUNT(*) FROM public.automacao_chunks WHERE ativo IS NOT FALSE),
      'acao_pausa_chunks',    (SELECT COUNT(*) FROM public.acao_pausa_chunks WHERE ativo IS NOT FALSE),
      'regras_operacionais_chunks', (SELECT COUNT(*) FROM public.regras_operacionais_chunks WHERE ativo IS NOT FALSE)
    ),
    'tenants_ativos', (SELECT COUNT(*) FROM public.profiles WHERE system_role='user' AND deletion_requested_at IS NULL),
    'reflexoes_7d', (SELECT COUNT(*) FROM public.reflection_log WHERE criado_em > now() - interval '7 days' AND deleted_at IS NULL),
    'candidates_pendentes', (SELECT COUNT(*) FROM public.chunk_candidates WHERE status IN ('pendente','pending')),
    'gerado_em', now()
  ) INTO v_resultado;

  RETURN v_resultado;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('erro', SQLERRM);
END $$;

CREATE OR REPLACE FUNCTION public.amostragem_estratificada(p_max_conversas int DEFAULT 50, p_dias int DEFAULT 7, p_tenant_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_resultado jsonb;
BEGIN
  PERFORM set_config('search_path', 'public', true);
  PERFORM set_config('statement_timeout', '8s', true);

  SELECT coalesce(jsonb_agg(t ORDER BY t.peso DESC), '[]'::jsonb)
  INTO v_resultado
  FROM (
    SELECT c.id AS conversation_id,
           c.tenant_id,
           c.lead_id,
           c.status,
           c.created_at,
           (SELECT COUNT(*) FROM public.messages m WHERE m.conversation_id = c.id AND m.deleted_at IS NULL) AS turnos,
           CASE
             WHEN c.created_at > now() - interval '1 day' THEN 1.0
             WHEN c.created_at > now() - interval '3 days' THEN 0.7
             ELSE 0.4
           END AS peso
    FROM public.conversations c
    WHERE c.created_at > now() - (p_dias || ' days')::interval
      AND (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id)
      AND c.phone NOT ILIKE 'chat-test-%'
    ORDER BY peso DESC, RANDOM()
    LIMIT p_max_conversas
  ) t;

  RETURN v_resultado;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('erro', SQLERRM);
END $$;

CREATE OR REPLACE FUNCTION public.falhas_agrupadas_periodo(p_dias int DEFAULT 7, p_tenant_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_resultado jsonb;
BEGIN
  PERFORM set_config('search_path', 'public', true);
  PERFORM set_config('statement_timeout', '5s', true);

  SELECT coalesce(jsonb_agg(t ORDER BY t.total DESC), '[]'::jsonb)
  INTO v_resultado
  FROM (
    SELECT motivo_falha,
           COUNT(*) AS total,
           array_agg(DISTINCT tenant_id) FILTER (WHERE tenant_id IS NOT NULL) AS tenants,
           array_agg(DISTINCT licao_gerada) FILTER (WHERE licao_gerada IS NOT NULL) AS licoes_geradas
    FROM public.reflection_log
    WHERE criado_em > now() - (p_dias || ' days')::interval
      AND deleted_at IS NULL
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY motivo_falha
    HAVING COUNT(*) >= 3
  ) t;

  RETURN v_resultado;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('erro', SQLERRM);
END $$;

CREATE OR REPLACE FUNCTION public.conversas_recentes_tenant(p_tenant_id uuid, p_dias int DEFAULT 7, p_limite int DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_resultado jsonb;
BEGIN
  PERFORM set_config('search_path', 'public', true);
  PERFORM set_config('statement_timeout', '5s', true);

  SELECT coalesce(jsonb_agg(t ORDER BY t.created_at DESC), '[]'::jsonb)
  INTO v_resultado
  FROM (
    SELECT c.id, c.lead_id, c.phone, c.status, c.created_at,
           l.name AS lead_name, l.pipeline_stage, l.lead_temperature, l.is_hot,
           (SELECT COUNT(*) FROM public.messages m WHERE m.conversation_id = c.id AND m.deleted_at IS NULL) AS turnos
    FROM public.conversations c
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
END $$;

CREATE OR REPLACE FUNCTION public.belief_resumo_tenant(p_tenant_id uuid, p_dias int DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_resultado jsonb;
BEGIN
  PERFORM set_config('search_path', 'public', true);
  PERFORM set_config('statement_timeout', '5s', true);

  SELECT coalesce(jsonb_agg(t ORDER BY t.total DESC), '[]'::jsonb)
  INTO v_resultado
  FROM (
    SELECT cb.proxima_intencao AS intencao,
           COUNT(*) AS total
    FROM public.conversation_belief cb
    WHERE cb.tenant_id = p_tenant_id
      AND cb.updated_at > now() - (p_dias || ' days')::interval
      AND cb.proxima_intencao IS NOT NULL
    GROUP BY cb.proxima_intencao
    HAVING COUNT(*) >= 2
  ) t;

  RETURN v_resultado;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('erro', SQLERRM);
END $$;

CREATE OR REPLACE FUNCTION public.chunks_atuais_tenant(p_tenant_id uuid, p_gaveta text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_resultado jsonb;
v_query text;
BEGIN
  PERFORM set_config('search_path', 'public', true);
  PERFORM set_config('statement_timeout', '5s', true);

  IF p_gaveta NOT IN ('knowledge_chunks','behavior_chunks','trigger_chunks','human_chunks','variation_chunks','meta_chunks','procedural_chunks','emocao_chunks','prova_social_chunks','acao_pausa_chunks','automacao_chunks','diretriz_bolha_chunks') THEN
    RETURN jsonb_build_object('erro', 'gaveta_invalida');
  END IF;

  v_query := format('SELECT coalesce(jsonb_agg(t), ''[]''::jsonb) FROM (SELECT id, escopo, ativo FROM public.%I WHERE (escopo=''tenant'' AND tenant_id=%L) OR escopo=''global'' OR (escopo=''nicho'') LIMIT 200) t', p_gaveta, p_tenant_id);
  EXECUTE v_query INTO v_resultado;

  RETURN coalesce(v_resultado, '[]'::jsonb);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('erro', SQLERRM);
END $$;

CREATE OR REPLACE FUNCTION public.cronjobs_saude(p_dias int DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_resultado jsonb;
BEGIN
  PERFORM set_config('search_path', 'public', true);
  PERFORM set_config('statement_timeout', '5s', true);

  SELECT coalesce(jsonb_agg(t ORDER BY t.execucoes DESC), '[]'::jsonb)
  INTO v_resultado
  FROM (
    SELECT cronjob_nome,
           COUNT(*) AS execucoes,
           COUNT(*) FILTER (WHERE resultado='sucesso') AS sucessos,
           COUNT(*) FILTER (WHERE resultado='erro') AS erros,
           MAX(iniciou_em) AS ultima
    FROM public.cronjobs_log
    WHERE iniciou_em > now() - (p_dias || ' days')::interval
    GROUP BY cronjob_nome
  ) t;

  RETURN v_resultado;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('erro', SQLERRM);
END $$;

CREATE OR REPLACE FUNCTION public.dedup_chunks_propostos(p_propostas jsonb, p_threshold numeric DEFAULT 0.85)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  -- Stub · dedup real será implementado no Sprint 6 com embedding match
  RETURN p_propostas;
END $$;

REVOKE ALL ON FUNCTION public.estado_curadoria_completo() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.estado_curadoria_completo() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.amostragem_estratificada(int, int, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.amostragem_estratificada(int, int, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.falhas_agrupadas_periodo(int, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.falhas_agrupadas_periodo(int, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.conversas_recentes_tenant(uuid, int, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.conversas_recentes_tenant(uuid, int, int) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.belief_resumo_tenant(uuid, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.belief_resumo_tenant(uuid, int) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.chunks_atuais_tenant(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.chunks_atuais_tenant(uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.cronjobs_saude(int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cronjobs_saude(int) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.dedup_chunks_propostos(jsonb, numeric) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.dedup_chunks_propostos(jsonb, numeric) TO authenticated, service_role;
;
