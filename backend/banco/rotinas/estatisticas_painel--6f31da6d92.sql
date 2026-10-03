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
$function$

