-- v3: ajusta contagem de chunks_curadoria (knowledge_chunks não tem tenant_id direto)

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

  SELECT jsonb_agg(to_jsonb(pr) ORDER BY pr.created_at DESC) INTO v_produtos
  FROM (SELECT * FROM public.produtos WHERE user_id = p_tenant_id ORDER BY created_at DESC LIMIT 30) pr;

  SELECT jsonb_agg(to_jsonb(ua)) INTO v_agentes
  FROM (SELECT * FROM public.user_agents WHERE user_id = p_tenant_id LIMIT 10) ua;

  SELECT jsonb_agg(to_jsonb(c) ORDER BY c.created_at DESC) INTO v_campanhas
  FROM (SELECT * FROM public.campaigns WHERE tenant_id = p_tenant_id AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 30) c;

  v_metricas := jsonb_build_object(
    'leads_total', (SELECT count(*) FROM public.leads WHERE tenant_id = p_tenant_id AND deleted_at IS NULL),
    'leads_ult_periodo', (SELECT count(*) FROM public.leads WHERE tenant_id = p_tenant_id AND deleted_at IS NULL AND created_at >= now() - (p_periodo_dias || ' days')::interval),
    'conversas_total', (SELECT count(*) FROM public.conversations WHERE tenant_id = p_tenant_id),
    'conversas_active', (SELECT count(*) FROM public.conversations WHERE tenant_id = p_tenant_id AND status = 'active'),
    'leads_dados_ficha_preenchida', (SELECT count(*) FROM public.leads WHERE tenant_id = p_tenant_id AND deleted_at IS NULL AND dados_ficha IS NOT NULL AND dados_ficha::text != '{}'),
    'tag_observations_ult_periodo', (SELECT count(*) FROM public.tag_observations WHERE tenant_id = p_tenant_id AND criado_em >= now() - (p_periodo_dias || ' days')::interval)
  );

  -- Curadoria multi-escopo: tenant_id direto onde existe; knowledge_chunks ignorado nessa contagem
  SELECT jsonb_agg(jsonb_build_object('tabela', kc.tabela, 'count', kc.n))
  INTO v_chunks FROM (
    SELECT 'behavior' AS tabela, count(*) AS n FROM public.behavior_chunks WHERE tenant_id = p_tenant_id AND ativo = true
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
;
