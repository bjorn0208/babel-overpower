
SET search_path = public, auth;

-- Estende load_agent_context com nicho_id do tenant — motor IA usa pra filtrar RAG Human/Behavior/Variation.
CREATE OR REPLACE FUNCTION public.load_agent_context(p_agent_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'agent', jsonb_build_object(
      'id', ua.id, 'identidade', ua.identidade, 'fluxo', ua.fluxo,
      'configuracao', ua.configuracao, 'modelo_principal', ua.modelo_principal,
      'temperatura', ua.temperatura, 'max_tokens', ua.max_tokens, 'is_active', ua.is_active
    ),
    'tenant_id', ua.user_id,
    'nicho_id', p.nicho_id,
    'empresa_nome', COALESCE(e.nome, ''),
    'subscription', CASE WHEN s.id IS NOT NULL THEN jsonb_build_object(
      'id', s.id, 'status', s.status, 'max_conversas', s.max_conversas,
      'conversas_usadas', s.conversas_usadas, 'plano_id', s.plano_id
    ) ELSE NULL END,
    'prompts', (SELECT jsonb_object_agg(pc.key, pc.content) FROM public.prompt_config pc)
  )
  FROM public.user_agents ua
  LEFT JOIN public.profiles p ON p.id = ua.user_id
  LEFT JOIN public.empresas e ON e.user_id = ua.user_id
  LEFT JOIN public.user_subscriptions s ON s.user_id = ua.user_id AND s.status = 'active' AND s.data_expiracao >= now()
  WHERE ua.id = p_agent_id
  LIMIT 1;
$function$;

;
