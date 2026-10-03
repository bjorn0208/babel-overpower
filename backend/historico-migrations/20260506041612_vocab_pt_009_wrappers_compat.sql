
-- Migration 9 — Wrappers EN pra funções RPC renomeadas
-- Garantia zero-break: caller velho continua funcionando via stub

-- expire_subscriptions (chamada por cron)
CREATE OR REPLACE FUNCTION public.expire_subscriptions()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$ SELECT public.expirar_assinaturas() $$;

-- export_my_data (chamada por frontend)
CREATE OR REPLACE FUNCTION public.export_my_data()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$ SELECT public.exportar_meus_dados() $$;

-- request_account_deletion (chamada por frontend)
CREATE OR REPLACE FUNCTION public.request_account_deletion()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$ SELECT public.solicitar_exclusao_conta() $$;

-- get_my_parent_user_id (frontend)
CREATE OR REPLACE FUNCTION public.get_my_parent_user_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$ SELECT public.obter_meu_usuario_pai_id() $$;

-- get_referral_owner_id (frontend)
CREATE OR REPLACE FUNCTION public.get_referral_owner_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$ SELECT public.obter_dono_indicacao_id() $$;

-- dashboard_stats (frontend) - precisa args
DO $$
DECLARE
  v_args TEXT;
  v_returns TEXT;
BEGIN
  SELECT pg_get_function_identity_arguments(p.oid),
         pg_get_function_result(p.oid)
  INTO v_args, v_returns
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'estatisticas_painel'
  LIMIT 1;
  
  -- Pegar argumentos sem types pra repassar
  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.dashboard_stats(%s) RETURNS %s LANGUAGE sql SECURITY DEFINER SET search_path = '''' AS $f$ SELECT public.estatisticas_painel(%s) $f$',
    v_args,
    v_returns,
    'p_tenant_id, p_period_start'  -- args pelo nome
  );
END $$;

-- dashboard_work_data (frontend)
DO $$
DECLARE
  v_args TEXT;
  v_returns TEXT;
BEGIN
  SELECT pg_get_function_identity_arguments(p.oid),
         pg_get_function_result(p.oid)
  INTO v_args, v_returns
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'dados_trabalho_painel'
  LIMIT 1;
  
  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.dashboard_work_data(%s) RETURNS %s LANGUAGE sql SECURITY DEFINER SET search_path = '''' AS $f$ SELECT public.dados_trabalho_painel(%s) $f$',
    v_args,
    v_returns,
    'p_tenant_id, p_period_start'
  );
END $$;

-- Permissões
GRANT EXECUTE ON FUNCTION public.expire_subscriptions() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.export_my_data() TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_account_deletion() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_parent_user_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_referral_owner_id() TO authenticated;

-- Comentário deprecação
COMMENT ON FUNCTION public.expire_subscriptions() IS 'DEPRECATED — use expirar_assinaturas. Mantido pra compat até deploy de código atualizado.';
COMMENT ON FUNCTION public.export_my_data() IS 'DEPRECATED — use exportar_meus_dados.';
COMMENT ON FUNCTION public.request_account_deletion() IS 'DEPRECATED — use solicitar_exclusao_conta.';
COMMENT ON FUNCTION public.get_my_parent_user_id() IS 'DEPRECATED — use obter_meu_usuario_pai_id.';
COMMENT ON FUNCTION public.get_referral_owner_id() IS 'DEPRECATED — use obter_dono_indicacao_id.';
COMMENT ON FUNCTION public.dashboard_stats(uuid, timestamptz) IS 'DEPRECATED — use estatisticas_painel.';
COMMENT ON FUNCTION public.dashboard_work_data(uuid, timestamptz) IS 'DEPRECATED — use dados_trabalho_painel.';

;
