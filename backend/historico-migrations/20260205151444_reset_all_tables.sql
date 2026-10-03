
-- ===============================================
-- MIGRATION: RESET ALL TABLES
-- Limpa tudo para recriar estrutura do FoodAtend
-- ===============================================

-- Desabilitar triggers temporariamente
SET session_replication_role = replica;

-- Dropar todas as tabelas do schema public (na ordem correta por dependências)
DROP TABLE IF EXISTS public.security_incidents CASCADE;
DROP TABLE IF EXISTS public.unanswered_questions CASCADE;
DROP TABLE IF EXISTS public.messages CASCADE;
DROP TABLE IF EXISTS public.conversations CASCADE;
DROP TABLE IF EXISTS public.analytics_daily CASCADE;
DROP TABLE IF EXISTS public.api_usage CASCADE;
DROP TABLE IF EXISTS public.special_events CASCADE;
DROP TABLE IF EXISTS public.special_hours CASCADE;
DROP TABLE IF EXISTS public.knowledge_items CASCADE;
DROP TABLE IF EXISTS public.custom_buttons CASCADE;
DROP TABLE IF EXISTS public.quick_actions CASCADE;
DROP TABLE IF EXISTS public.stores CASCADE;
DROP TABLE IF EXISTS public.agents CASCADE;
DROP TABLE IF EXISTS public.subscriptions CASCADE;
DROP TABLE IF EXISTS public.plans CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.support_messages CASCADE;
DROP TABLE IF EXISTS public.system_settings CASCADE;
DROP TABLE IF EXISTS public.security_patterns CASCADE;
DROP TABLE IF EXISTS public.verification_responses CASCADE;
DROP TABLE IF EXISTS public.tenant_permissions CASCADE;
DROP TABLE IF EXISTS public.tenant_quotas CASCADE;
DROP TABLE IF EXISTS public.api_keys CASCADE;

-- Dropar funções customizadas (se existirem)
DROP FUNCTION IF EXISTS public.is_admin() CASCADE;
DROP FUNCTION IF EXISTS public.get_user_agent_id() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.update_updated_at() CASCADE;
DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS public.check_security_patterns(TEXT, FLOAT) CASCADE;
DROP FUNCTION IF EXISTS public.hybrid_knowledge_search(UUID, UUID, TEXT, TEXT[], FLOAT, INT) CASCADE;
DROP FUNCTION IF EXISTS public.increment_analytics(UUID, DATE) CASCADE;
DROP FUNCTION IF EXISTS public.increment_conversation_count(UUID, DATE) CASCADE;
DROP FUNCTION IF EXISTS public.increment_security_pattern_counter(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.get_available_api_key() CASCADE;
DROP FUNCTION IF EXISTS public.update_api_key_usage(UUID, INT) CASCADE;
DROP FUNCTION IF EXISTS public.mark_api_key_rate_limited(UUID, INT) CASCADE;
DROP FUNCTION IF EXISTS public.reset_daily_api_counters() CASCADE;
DROP FUNCTION IF EXISTS public.check_quota(UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.has_permission(UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.generate_public_slug() CASCADE;
DROP FUNCTION IF EXISTS public.on_new_conversation() CASCADE;
DROP FUNCTION IF EXISTS public.get_usd_brl_rate() CASCADE;

-- Reabilitar triggers
SET session_replication_role = DEFAULT;

;
