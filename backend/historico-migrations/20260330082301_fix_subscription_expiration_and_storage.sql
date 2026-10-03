-- 1. Alterar load_agent_context para filtrar por data_expiracao
CREATE OR REPLACE FUNCTION public.load_agent_context(p_agent_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'agent', jsonb_build_object(
      'id', ua.id, 'identidade', ua.identidade, 'fluxo', ua.fluxo,
      'configuracao', ua.configuracao, 'modelo_principal', ua.modelo_principal,
      'temperatura', ua.temperatura, 'max_tokens', ua.max_tokens, 'is_active', ua.is_active
    ),
    'tenant_id', ua.user_id,
    'empresa_nome', COALESCE(e.nome, ''),
    'subscription', CASE WHEN s.id IS NOT NULL THEN jsonb_build_object(
      'id', s.id, 'status', s.status, 'max_conversas', s.max_conversas,
      'conversas_usadas', s.conversas_usadas, 'plano_id', s.plano_id
    ) ELSE NULL END,
    'prompts', (SELECT jsonb_object_agg(pc.key, pc.content) FROM public.prompt_config pc)
  )
  FROM public.user_agents ua
  LEFT JOIN public.empresas e ON e.user_id = ua.user_id
  LEFT JOIN public.user_subscriptions s ON s.user_id = ua.user_id AND s.status = 'active' AND s.data_expiracao >= now()
  WHERE ua.id = p_agent_id
  LIMIT 1;
$$;

-- 2. Function para expirar subscriptions
CREATE OR REPLACE FUNCTION public.expire_subscriptions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.user_subscriptions
  SET status = 'expired', updated_at = now()
  WHERE status = 'active'
  AND data_expiracao < now();
END;
$$;

-- 3. Cron diario para expirar (03:05 UTC = 00:05 BRT)
SELECT cron.schedule('expire-subscriptions', '5 3 * * *', 'SELECT public.expire_subscriptions()');

-- 4. Executar imediatamente para corrigir casos atuais
SELECT public.expire_subscriptions();

-- 5. Function de recalculo de storage
CREATE OR REPLACE FUNCTION public.recalculate_storage(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_total bigint;
BEGIN
  SELECT COALESCE(SUM((metadata->>'size')::bigint), 0)
  INTO v_total
  FROM storage.objects
  WHERE (path_tokens[1] = p_user_id::text);

  UPDATE public.user_subscriptions
  SET storage_used_bytes = v_total, updated_at = now()
  WHERE user_id = p_user_id;
END;
$$;

-- 6. Recalcular TODOS os usuarios
SELECT public.recalculate_storage(user_id) FROM public.user_subscriptions;

-- 7. Cron semanal de reconciliacao (domingo 04:00 UTC)
SELECT cron.schedule('reconcile-storage', '0 4 * * 0', 'SELECT public.recalculate_storage(user_id) FROM public.user_subscriptions WHERE status = ''active''');
;
