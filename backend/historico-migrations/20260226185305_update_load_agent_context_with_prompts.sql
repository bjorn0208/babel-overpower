
CREATE OR REPLACE FUNCTION public.load_agent_context(p_agent_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'agent', jsonb_build_object(
      'id', ua.id,
      'identidade', ua.identidade,
      'fluxo', ua.fluxo,
      'configuracao', ua.configuracao,
      'modelo_principal', ua.modelo_principal,
      'temperatura', ua.temperatura,
      'max_tokens', ua.max_tokens
    ),
    'tenant_id', ua.user_id,
    'empresa_nome', COALESCE(e.nome, ''),
    'subscription', CASE WHEN s.id IS NOT NULL THEN jsonb_build_object(
      'id', s.id,
      'status', s.status,
      'max_conversas', s.max_conversas,
      'conversas_usadas', s.conversas_usadas,
      'plano_id', s.plano_id
    ) ELSE NULL END,
    'prompts', (
      SELECT jsonb_object_agg(pc.key, pc.content)
      FROM prompt_config pc
    )
  )
  FROM user_agents ua
  LEFT JOIN empresas e ON e.user_id = ua.user_id
  LEFT JOIN user_subscriptions s ON s.user_id = ua.user_id AND s.status = 'active'
  WHERE ua.id = p_agent_id
  LIMIT 1;
$function$;

;
